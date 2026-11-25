import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { once } from 'node:events';
import { request } from 'node:http';
import { after, test } from 'node:test';
import express from 'express';
import mongoose from 'mongoose';

const host = 'admin.transitly.test';
const password = 'fixture-admin-password-long';
Object.assign(process.env, {
  NODE_ENV: 'production',
  ADMIN_HOST: host,
  ADMIN_PANEL_PASSWORD: password,
  ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  APP_ORIGIN: 'https://transitly.test,https://localhost,capacitor://localhost',
  TURNSTILE_SECRET_KEY: 'fixture-turnstile-secret',
  GEMINI_API_KEY: 'fixture-gemini-secret',
  PASSWORD_PEPPER: 'fixture-password-pepper'
});

const { default: adminRoutes } = await import('../routes/admin.js');
const { redirectAdminHome, requireAdminAccess } = await import('./adminAccess.js');
const { verifyTurnstile } = await import('./turnstile.js');
const { emailActionLimiter } = await import('./security.js');
const { default: secondLookRoutes } = await import('../routes/secondlook.js');
const { default: authRoutes } = await import('../routes/auth.js');
const { default: User } = await import('../models/User.js');
const { hashPassword } = await import('../utils/crypto.js');
const { readAnnouncement } = await import('../services/siteAnnouncement.js');
const localFetch = globalThis.fetch;

const app = express();
app.set('trust proxy', 1);
app.get('/admin', requireAdminAccess, (req, res) => res.sendStatus(200));
app.get(['/', '/index.html'], redirectAdminHome, (req, res) => res.sendStatus(200));
app.use('/api/admin', adminRoutes);
app.use(express.json());
app.use(secondLookRoutes);
let sessionFixture;
app.use('/auth', (req, res, next) => { req.session = sessionFixture; next(); }, authRoutes);
app.post('/verify', verifyTurnstile('login'), (req, res) => res.sendStatus(204));
app.post('/limit', emailActionLimiter({ maxByIp: 2, maxByEmail: 2 }), (req, res) => res.sendStatus(204));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
after(() => server.close());

function send(path, { headers, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: {
      'Content-Type': 'application/json',
      ...(payload !== undefined ? { 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers
    } }, response => {
      response.resume();
      response.on('end', () => resolve(response));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(payload);
  });
}

test('admin requires its own host and an unused authenticator code before issuing a session', async t => {
  const clock = t.mock.timers;
  clock.enable({ apis: ['Date'], now: 59_000 });
  const headers = { host };
  const origin = 'https://' + host;
  const post = (body, requestOrigin = origin) => send('/api/admin/login', { headers: { ...headers, origin: requestOrigin }, body });
  const code = '287082'; // Last six digits of the RFC 6238 SHA-1 test vector at 59 seconds.
  assert.equal((await send('/admin', { headers: { host: 'transitly.test' } })).statusCode, 404);
  assert.equal((await send('/api/admin/settings', { headers: { host: 'transitly.test' } })).statusCode, 404);
  assert.equal((await send('/admin', { headers })).statusCode, 200);
  assert.equal((await send('/', { headers: { host: 'transitly.test' } })).statusCode, 200);
  for (const path of ['/', '/index.html']) {
    const redirect = await send(path, { headers });
    assert.equal(redirect.statusCode, 302);
    assert.equal(redirect.headers.location, '/admin');
    assert.equal(redirect.headers['cache-control'], 'no-store');
  }
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 401);
  assert.equal((await send('/api/admin/announcement', { headers: { ...headers, origin }, method: 'PUT', body: {} })).statusCode, 401);
  assert.equal((await post({ password, code }, 'https://transitly.test')).statusCode, 403);
  assert.equal((await post({ password })).statusCode, 401);
  assert.equal((await post({ password, code: '000000' })).statusCode, 401);
  assert.equal((await post({ password: 'wrong', code })).statusCode, 401);

  const login = await post({ password, code });
  assert.equal(login.statusCode, 200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  assert.equal((await post({ password, code })).statusCode, 401);
  headers.cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 200);
  await t.test('publish, expire and unpublish a public announcement', async t => {
    const previousUri = process.env.MONGODB_URI;
    const previousDb = mongoose.connection.db;
    let stored;
    const collection = {
      replaceOne: async (filter, replacement) => { assert.equal(filter._id, 'current'); stored = replacement; },
      findOne: async filter => stored && (!stored.expiresAt || stored.expiresAt > filter.$or[1].expiresAt.$gt) ? stored : null,
      deleteOne: async () => { stored = null; }
    };
    process.env.MONGODB_URI = 'mongodb://127.0.0.1/fixture';
    Object.defineProperty(mongoose.connection, 'readyState', { configurable: true, value: 1 });
    mongoose.connection.db = { collection: name => { assert.equal(name, 'site_announcements'); return collection; } };
    t.after(() => {
      if (previousUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI = previousUri;
      delete mongoose.connection.readyState;
      mongoose.connection.db = previousDb;
    });
    const change = (method, body) => send('/api/admin/announcement', { headers: { ...headers, origin }, method, body });
    assert.equal((await change('PUT', { text: ' ', level: 'warning', expiresAt: null })).statusCode, 400);
    assert.equal((await change('PUT', { text: 'Diversion', level: ['info'], expiresAt: null })).statusCode, 400);
    assert.equal((await change('PUT', { text: 'Diversion', level: 'warning', expiresAt: new Date(58000).toISOString() })).statusCode, 400);
    assert.equal((await change('PUT', { text: ' Diversion ', level: 'warning', expiresAt: new Date(60000).toISOString() })).statusCode, 200);
    assert.equal((await readAnnouncement()).text, 'Diversion');
    assert.equal((await readAnnouncement()).level, 'warning');
    assert.equal((await change('DELETE')).statusCode, 200);
    assert.equal(await readAnnouncement(), null);
    assert.equal((await change('PUT', { text: 'Diversion', level: 'info', expiresAt: new Date(60000).toISOString() })).statusCode, 200);
    clock.tick(1001);
    assert.equal(await readAnnouncement(), null);
  });
  assert.equal((await send('/api/admin/logout', { headers: { ...headers, origin }, method: 'POST' })).statusCode, 200);
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 401);
});

test('Turnstile requires successful verification for the expected action and public hostname', async t => {
  let result = { success: true, action: 'login', hostname: 'transitly.test' };
  const siteverify = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(JSON.parse(options.body).response, 'fixture-token');
    return Response.json(result);
  });
  const body = { turnstileToken: 'fixture-token' };
  assert.equal((await send('/verify', { body: {} })).statusCode, 400);
  assert.equal(siteverify.mock.callCount(), 0);
  assert.equal((await send('/verify', { body })).statusCode, 204);
  result = { ...result, action: 'register' };
  assert.equal((await send('/verify', { body })).statusCode, 400);
  result = { ...result, action: 'login', hostname: 'localhost' };
  assert.equal((await send('/verify', { body })).statusCode, 400);
  result = { ...result, hostname: 'transitly.test', success: false };
  assert.equal((await send('/verify', { body })).statusCode, 400);
});

test('the auth rate limits count both IP and normalized email', async () => {
  const attempt = (ip, email) => send('/limit', { headers: { 'X-Forwarded-For': ip }, body: { email } });
  assert.equal((await attempt('192.0.2.1', 'one@example.test')).statusCode, 204);
  assert.equal((await attempt('192.0.2.2', 'ONE@example.test ')).statusCode, 204);
  assert.equal((await attempt('192.0.2.3', 'one@example.test')).statusCode, 429);
  assert.equal((await attempt('192.0.2.1', 'two@example.test')).statusCode, 204);
  assert.equal((await attempt('192.0.2.1', 'three@example.test')).statusCode, 429);
});

test('unset NODE_ENV keeps auth, Turnstile, and SMTP in restricted mode', () => {
  const script = [
    "import assert from 'node:assert/strict';",
    "import { isDev } from './backend/config/env.js';",
    "import { getAllowedOrigins } from './backend/config/origins.js';",
    "import { sendVerificationEmail } from './backend/services/email.js';",
    "import { verifyTurnstile } from './backend/middleware/turnstile.js';",
    "assert.equal(isDev, false);",
    "assert.deepEqual([...getAllowedOrigins()], []);",
    "await assert.rejects(sendVerificationEmail('fixture@example.test', 'fixture-token'));",
    "const res = { status(code) { assert.equal(code, 503); return this; }, json() {} };",
    "await verifyTurnstile('login')({}, res, () => assert.fail('bypassed'));"
  ].join('\n');
  const env = { ...process.env, APP_ORIGIN: '', SMTP_HOST: '', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' };
  delete env.NODE_ENV;
  const check = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env });
  assert.equal(check.status, 0, String(check.stderr));
});

test('SecondLook validates the challenge before upload and sends cleaned JPEGs', async t => {
  let requests = 0;
  const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } })
    .withExif({ IFD0: { Artist: 'test-fixture' } }).jpeg().toBuffer();
  assert.ok((await sharp(photo).metadata()).exif);
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const target = new URL(url);
    const body = JSON.parse(init.body);
    if (target.hostname === 'challenges.cloudflare.com') {
      assert.equal(body.response, 'fixture-photo-token');
      return Response.json({ success: true, hostname: 'transitly.test', action: 'analyze_photos' });
    }
    assert.equal(target.hostname, 'generativelanguage.googleapis.com');
    const image = body.contents[0].parts.find(part => part.inlineData).inlineData;
    assert.equal(image.mimeType, 'image/jpeg');
    assert.equal((await sharp(Buffer.from(image.data, 'base64')).metadata()).exif, undefined);
    requests++;
    return Response.json({ candidates: [{ content: { parts: [{ text: 'OBSERVATIONS: Test image' }], role: 'model' } }] });
  });
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/analyze-photos';
  const headers = { origin: 'https://transitly.test' };
  assert.equal((await localFetch(endpoint, { method: 'POST', headers, body: 'not multipart' })).status, 400);
  assert.equal(requests, 0);
  const form = new FormData();
  form.set('images', new Blob([photo], { type: 'image/jpeg' }), 'fixture.jpg');
  const response = await localFetch(endpoint, { method: 'POST', headers: { ...headers, 'X-Turnstile-Token': 'fixture-photo-token' }, body: form });
  assert.equal(response.status, 200);
  assert.equal(requests, 1);
});

test('account deletion requires password confirmation or a recent Google sign-in', async t => {
  const password = 'fixture-user-password';
  const user = { _id: 'fixture-user', sessionVersion: 0, passwordHash: await hashPassword(password) };
  t.mock.method(User, 'findById', () => ({ select: async () => user }));
  const remove = t.mock.method(User, 'deleteOne', async () => ({ deletedCount: 1 }));
  sessionFixture = { userId: user._id, destroy: done => done() };
  const removeAccount = body => send('/auth/me', { method: 'DELETE', headers: { origin: 'https://transitly.test' }, body });
  assert.equal((await removeAccount({})).statusCode, 401);
  assert.equal((await removeAccount({ password: 'wrong-password' })).statusCode, 401);
  assert.equal(remove.mock.callCount(), 0);
  assert.equal((await removeAccount({ password })).statusCode, 200);
  user.googleSubject = 'fixture-google-user';
  sessionFixture.googleAuthenticatedAt = Date.now() - 6 * 60_000;
  assert.equal((await removeAccount({})).statusCode, 401);
  sessionFixture.googleAuthenticatedAt = Date.now();
  assert.equal((await removeAccount({})).statusCode, 200);
  assert.equal(remove.mock.callCount(), 2);
});
