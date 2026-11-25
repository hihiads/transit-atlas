import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { after, test } from 'node:test';
import express from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const host = 'admin.transitly.test';
const issuer = 'https://test.cloudflareaccess.com';
const audience = 'transitly-admin';
const password = 'fixture-admin-password';
Object.assign(process.env, {
  NODE_ENV: 'production',
  ADMIN_HOST: host,
  ADMIN_PANEL_PASSWORD: password,
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: new URL(issuer).hostname,
  CLOUDFLARE_ACCESS_AUD: audience,
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

test('admin routes require the dedicated host and Access identity, then an admin session', async t => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
  const jwk = { ...await exportJWK(publicKey), kid: 'fixture', alg: 'RS256' };
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(String(url), `${issuer}/cdn-cgi/access/certs`);
    return Response.json({ keys: [jwk] });
  });
  const sign = (subject, aud = audience) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'fixture' })
    .setIssuer(issuer).setAudience(aud).setSubject(subject).setExpirationTime('5m').sign(privateKey);
  const headers = { host, 'Cf-Access-Jwt-Assertion': await sign('admin-1') };
  const origin = `https://${host}`;

  assert.equal((await send('/admin', { headers: { ...headers, host: 'transitly.test' } })).statusCode, 404);
  assert.equal((await send('/admin', { headers: { host } })).statusCode, 403);
  assert.equal((await send('/admin', { headers: { ...headers, 'Cf-Access-Jwt-Assertion': await sign('admin-1', 'other-app') } })).statusCode, 403);
  assert.equal((await send('/admin', { headers })).statusCode, 200);
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 401);
  assert.equal((await send('/api/admin/logout', { headers: { ...headers, origin }, method: 'POST' })).statusCode, 401);
  assert.equal((await send('/api/admin/login', { headers: { ...headers, origin: 'https://transitly.test' }, body: { password } })).statusCode, 403);

  const login = await send('/api/admin/login', { headers: { ...headers, origin }, body: { password } });
  assert.equal(login.statusCode, 200);
  assert.match(login.headers['set-cookie'][0], /HttpOnly; Secure; SameSite=Strict/);
  headers.cookie = login.headers['set-cookie'][0].split(';')[0];
  assert.equal((await send('/api/admin/settings', { headers })).statusCode, 200);
  assert.equal((await send('/api/admin/settings', { headers: { ...headers, 'Cf-Access-Jwt-Assertion': await sign('admin-2') } })).statusCode, 403);
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
