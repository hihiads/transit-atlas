import { createHash, createHmac, timingSafeEqual, randomBytes } from 'crypto';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { getRuntimeSettings, isAuthenticationEnabled, missingAuthenticationEnvironment, saveRuntimeSettings } from '../config/runtimeSettings.js';
import { activateAuthentication } from '../services/authRuntime.js';
import { adminLimiter } from '../middleware/security.js';
import { isAllowedOrigin } from '../config/origins.js';

const router = express.Router();
const cookieName = 'transit-admin';
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/admin', maxAge: 8 * 60 * 60 * 1000 };

function sessionSignature(value) {
  const key = process.env.ADMIN_PANEL_SECRET || process.env.ADMIN_PANEL_PASSWORD;
  return createHmac('sha256', key).update(value).digest('base64url');
}

function isAdmin(req) {
  if (!process.env.ADMIN_PANEL_PASSWORD) return false;
  const cookie = (req.headers.cookie || '').split('; ').find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!cookie) return false;
  const [payload, signature] = cookie.split('.');
  if (!payload || !signature || !timingSafeEqual(createHash('sha256').update(signature).digest(), createHash('sha256').update(sessionSignature(payload)).digest())) return false;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).expires > Date.now(); } catch { return false; }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Prijavite se u administratorski panel.' });
  next();
}

router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Zahtjev nije dopušten.' });
  next();
});

router.post('/login', adminLimiter, body('password').isString().isLength({ min: 1, max: 256 }), (req, res) => {
  if (!process.env.ADMIN_PANEL_PASSWORD || process.env.ADMIN_PANEL_PASSWORD.length < 16) {
    return res.status(503).json({ error: 'Administratorska prijava nije konfigurirana.' });
  }
  const errors = validationResult(req);
  const supplied = createHash('sha256').update(errors.isEmpty() ? req.body.password : '').digest();
  const expected = createHash('sha256').update(process.env.ADMIN_PANEL_PASSWORD).digest();
  if (!errors.isEmpty() || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Lozinka nije ispravna.' });
  const payload = Buffer.from(JSON.stringify({ expires: Date.now() + cookieOptions.maxAge, nonce: randomBytes(16).toString('hex') })).toString('base64url');
  res.cookie(cookieName, `${payload}.${sessionSignature(payload)}`, cookieOptions).json({ message: 'Prijavljeni ste.' });
});

router.post('/logout', (req, res) => res.clearCookie(cookieName, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/admin' }).json({ message: 'Odjavljeni ste.' }));

router.get('/settings', requireAdmin, (req, res) => res.json({
  settings: getRuntimeSettings(),
  authenticationActive: isAuthenticationEnabled(),
  missingEnvironment: []
}));

router.patch('/settings', requireAdmin,
  body('loginEnabled').isBoolean({ strict: true }),
  body('registrationEnabled').isBoolean({ strict: true }),
  body('googleEnabled').isBoolean({ strict: true }),
  body('appleEnabled').isBoolean({ strict: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty() || Object.values(req.body).some(value => typeof value !== 'boolean')) return res.status(400).json({ error: 'Postavke nisu valjane.' });
    const next = { loginEnabled: req.body.loginEnabled, registrationEnabled: req.body.registrationEnabled, googleEnabled: req.body.googleEnabled, appleEnabled: req.body.appleEnabled };
    if (next.loginEnabled || next.registrationEnabled) {
      const missing = missingAuthenticationEnvironment(next);
      if (missing.length) return res.status(409).json({ error: 'Prijava se ne može uključiti dok nedostaju ove postavke.', missingEnvironment: missing });
      try {
        await activateAuthentication();
      } catch (error) {
        return res.status(503).json({ error: `Ne mogu povezati bazu podataka: ${error.message}` });
      }
    }
    try {
      const settings = await saveRuntimeSettings(next);
      res.json({ settings, authenticationActive: next.loginEnabled || next.registrationEnabled });
    } catch (error) {
      console.error('Admin settings save failed:', error.message);
      res.status(500).json({ error: 'Postavke nisu spremljene.' });
    }
  }
);

export default router;
