import { createRemoteJWKSet, jwtVerify } from 'jose';

const production = process.env.NODE_ENV === 'production';
const adminHost = process.env.ADMIN_HOST?.trim().toLowerCase();
const teamDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim().toLowerCase();
const audience = process.env.CLOUDFLARE_ACCESS_AUD?.trim();
const issuer = /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(teamDomain || '') ? `https://${teamDomain}` : null;
const accessKeys = issuer && createRemoteJWKSet(new URL('/cdn-cgi/access/certs', issuer));

export async function requireAdminAccess(req, res, next) {
  res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  if (!production) return next();

  if (!adminHost || req.get('host')?.toLowerCase() !== adminHost || !accessKeys || !audience) {
    return res.sendStatus(404);
  }

  const assertion = req.get('Cf-Access-Jwt-Assertion');
  if (!assertion) return res.sendStatus(403);
  try {
    const { payload } = await jwtVerify(assertion, accessKeys, { issuer, audience, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'] });
    if (typeof payload.sub !== 'string' || !payload.sub) return res.sendStatus(403);
    res.locals.adminSubject = payload.sub;
  } catch {
    return res.sendStatus(403);
  }
  next();
}
