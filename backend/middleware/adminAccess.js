const production = process.env.NODE_ENV === 'production';
const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase();

export function requireAdminAccess(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  if (production && (!adminHost || req.get('host')?.toLowerCase() !== adminHost)) {
    return res.sendStatus(404);
  }
  next();
}
