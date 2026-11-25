const production = process.env.NODE_ENV === 'production';
const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase();

function isAdminHost(req) {
  return Boolean(adminHost && req.get('host')?.toLowerCase() === adminHost);
}

export function redirectAdminHome(req, res, next) {
  if (!production || !isAdminHost(req)) return next();
  res.set('Cache-Control', 'no-store').redirect(302, '/admin');
}

export function requireAdminAccess(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  if (production && !isAdminHost(req)) {
    return res.sendStatus(404);
  }
  next();
}
