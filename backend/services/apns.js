// Apple Push Notification service (APNs) sender, token-based (.p8 key), HTTP/2.
import http2 from 'node:http2';
import { SignJWT, importPKCS8 } from 'jose';

const bundleId = process.env.APNS_BUNDLE_ID?.trim() || 'eu.transitly.app';
const keyId = process.env.APNS_KEY_ID?.trim();
const teamId = process.env.APNS_TEAM_ID?.trim();
const privateKey = (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
// Debug builds signed by Xcode need the sandbox host; TestFlight and App Store builds need production.
const origin = process.env.APNS_ENV === 'sandbox' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';

export const pushConfigured = Boolean(keyId && teamId && privateKey);

let cachedJwt = null;
async function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  // APNs accepts a provider token for up to an hour; refresh after 40 minutes.
  if (cachedJwt && now - cachedJwt.issuedAt < 40 * 60) return cachedJwt.token;
  const key = await importPKCS8(privateKey, 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .sign(key);
  cachedJwt = { token, issuedAt: now };
  return token;
}

export function alertPayload({ title, body, data = {} }) {
  return { aps: { alert: { title, body }, sound: 'default' }, ...data };
}

function postOne(session, deviceToken, jwt, payload) {
  return new Promise(resolve => {
    const request = session.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json'
    });
    let status = 0;
    let raw = '';
    request.setEncoding('utf8');
    request.on('response', headers => { status = Number(headers[':status']); });
    request.on('data', chunk => { raw += chunk; });
    request.on('error', error => resolve({ deviceToken, ok: false, status: 0, reason: error.code || 'NETWORK' }));
    request.on('end', () => {
      let reason = null;
      try { reason = raw ? JSON.parse(raw).reason ?? null : null; } catch { reason = null; }
      resolve({ deviceToken, ok: status === 200, status, reason });
    });
    request.end(JSON.stringify(payload));
  });
}

// Sends one alert to each device token. Returns one result per token; callers remove tokens
// whose result has status 410 or reason BadDeviceToken / Unregistered.
export async function sendAlerts(deviceTokens, alert) {
  if (!pushConfigured || deviceTokens.length === 0) return [];
  const jwt = await providerToken();
  const payload = alertPayload(alert);
  const session = http2.connect(origin);
  session.on('error', () => {});
  try {
    return await Promise.all(deviceTokens.map(token => postOne(session, token, jwt, payload)));
  } finally {
    session.close();
  }
}
