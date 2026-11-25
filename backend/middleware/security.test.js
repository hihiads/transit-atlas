import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { after, test } from 'node:test';
import express from 'express';

const host = 'admin.transitly.test';
const password = 'fixture-admin-password';
Object.assign(process.env, {
  NODE_ENV: 'production',
  ADMIN_HOST: host,
  ADMIN_PANEL_PASSWORD: password,
  ADMIN_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
  APP_ORIGIN: 'https://transitly.test,https://localhost,capacitor://localhost',
  TURNSTILE_SECRET_KEY: 'fixture-turnstile-secret'
});

const { default: adminRoutes } = await import('../routes/admin.js');
const { requireAdminAccess } = await import('./adminAccess.js');
const { verifyTurnstile } = await import('./turnstile.js');
const { emailActionLimiter } = await import('./security.js');

const app = express();
app.set('trust proxy', 1);
app.get('/admin', requireAdminAccess, (req, res) => res.sendStatus(200));
app.use('/api/admin', adminRoutes);
app.use(express.json());
app.post('/verify', verifyTurnstile('login'), (req, res) => res.sendStatus(204));
app.post('/limit', emailActionLimiter({ maxByIp: 2, maxByEmail: 2 }), (req, res) => res.sendStatus(204));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
after(() => server.close());

function send(path, { headers, body, method = body === undefined ? 'GET' : 'POST' } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, method, headers: {
      'Content-Type': 'application/json', ...headers
    } }, response => {
      response.resume();
      response.on('end', () => resolve(response));
      response.on('error', reject);
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

test('admin requires its own host and an unused authenticator code before issuing a session', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 59_000 });
  const headers = { host };
  const origin = 'https://' + host;
  const post = (body, requestOrigin = origin) => send('/api/admin/login', { headers: { ...headers, origin: requestOrigin }, body });
  const code = '287082'; // Last six digits of the RFC 6238 SHA-1 test vector at 59 seconds.
  assert.equal((await send('/admin', { headers: { host: 'transitly.test' } })).statusCode, 404);
  assert.equal((await send('/api/admin/settings', { headers: { host: 'transitly.test' } })).statusCode, 404);
  assert.equal((await send('/admin', { headers })).statusCode, 200);
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 401);
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
