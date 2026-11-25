import { isDev } from './env.js';
const developmentOrigins = !isDev ? [] : [
  'http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173', 'http://localhost:3001',
  'http://127.0.0.1:3000', 'http://127.0.0.1:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001'
];

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === 'null' ? `${url.protocol}//${url.host}` : url.origin;
  } catch { return null; }
}

export function isNativeAppOrigin(origin) {
  const normalized = normalizeOrigin(origin || '');
  return normalized === 'https://localhost' || normalized === 'capacitor://localhost';
}

export function getAllowedOrigins() {
  return new Set([
    ...developmentOrigins,
    ...(process.env.APP_ORIGIN || '').split(',').map(origin => normalizeOrigin(origin.trim())).filter(Boolean)
  ]);
}

export function isAllowedOrigin(origin) {
  return getAllowedOrigins().has(normalizeOrigin(origin));
}

export function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');
  const safeMethod = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if ((origin && !isAllowedOrigin(origin)) ||
      (!origin && !safeMethod && !isDev)) {
    return res.status(403).json({ error: 'Zahtjev nije dopušten.' });
  }
  next();
}
