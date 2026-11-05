const developmentOrigins = process.env.NODE_ENV === 'production' ? [] : [
  'http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173', 'http://localhost:3001',
  'http://127.0.0.1:3000', 'http://127.0.0.1:4173', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001'
];

function normalizeOrigin(value) {
  try { return new URL(value).origin; } catch { return null; }
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
