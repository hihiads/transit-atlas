import { createHash, timingSafeEqual, randomBytes } from 'crypto';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { getRuntimeSettings, isAuthenticationEnabled, missingAuthenticationEnvironment, saveRuntimeSettings } from '../config/runtimeSettings.js';
import { activateAuthentication } from '../services/authRuntime.js';
import { adminLimiter } from '../middleware/security.js';
import { requireTrustedOrigin } from '../config/origins.js';

const router = express.Router();
const cookieName = 'transit-admin';
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/api/admin', maxAge: 30 * 60 * 1000 };

const adminSessions = new Map();

function sessionKey(req) {
  const token = (req.headers.cookie || '').split(/;\s*/).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : undefined;
}

function requireAdmin(req, res, next) {
  const key = sessionKey(req);
  if (!(adminSessions.get(key) > Date.now())) {
    adminSessions.delete(key);
    return res.status(401).json({ error: 'Prijavite se u administratorski panel.' });
  }
  next();
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireTrustedOrigin);

router.post('/login', adminLimiter, body('password').isString().isLength({ min: 1, max: 256 }), (req, res) => {
  if (!process.env.ADMIN_PANEL_PASSWORD || process.env.ADMIN_PANEL_PASSWORD.length < 16) {
    return res.status(503).json({ error: 'Administratorska prijava nije konfigurirana.' });
  }
  const errors = validationResult(req);
  const supplied = createHash('sha256').update(errors.isEmpty() ? req.body.password : '').digest();
  const expected = createHash('sha256').update(process.env.ADMIN_PANEL_PASSWORD).digest();
  if (!errors.isEmpty() || !timingSafeEqual(supplied, expected)) {
    console.info(JSON.stringify({ event: 'admin.login', outcome: 'failure' }));
    return res.status(401).json({ error: 'Lozinka nije ispravna.' });
  }
  const now = Date.now();
  for (const [key, expiresAt] of adminSessions) {
    if (expiresAt <= now) adminSessions.delete(key);
  }
  adminSessions.delete(sessionKey(req));
  if (adminSessions.size >= 100) {
    return res.status(503).json({ error: 'Previše aktivnih administratorskih sesija.' });
  }
  const token = randomBytes(32).toString('hex');
  adminSessions.set(createHash('sha256').update(token).digest('hex'), now + cookieOptions.maxAge);
  console.info(JSON.stringify({ event: 'admin.login', outcome: 'success' }));
  res.cookie(cookieName, token, cookieOptions).json({ message: 'Prijavljeni ste.' });
});

router.post('/logout', (req, res) => {
  if (adminSessions.delete(sessionKey(req))) {
    console.info(JSON.stringify({ event: 'admin.logout', outcome: 'success' }));
  }
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(cookieName, clearOptions).json({ message: 'Odjavljeni ste.' });
});

router.get('/settings', requireAdmin, (req, res) => res.json({
  settings: getRuntimeSettings(),
  authenticationActive: isAuthenticationEnabled(),
  missingEnvironment: []
}));

router.patch('/settings', requireAdmin,
  body('loginEnabled').isBoolean({ strict: true }),
  body('registrationEnabled').isBoolean({ strict: true }),
  body('googleEnabled').isBoolean({ strict: true }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty() || Object.values(req.body).some(value => typeof value !== 'boolean')) return res.status(400).json({ error: 'Postavke nisu valjane.' });
    const next = { loginEnabled: req.body.loginEnabled, registrationEnabled: req.body.registrationEnabled, googleEnabled: req.body.googleEnabled };
    if (next.loginEnabled || next.registrationEnabled) {
      const missing = missingAuthenticationEnvironment();
      if (missing.length) return res.status(409).json({ error: 'Prijava se ne može uključiti dok nedostaju ove postavke.', missingEnvironment: missing });
      try {
        await activateAuthentication();
      } catch (error) {
        console.error('Admin authentication activation failed:', error.name);
        return res.status(503).json({ error: 'Ne mogu povezati bazu podataka.' });
      }
    }
    try {
      const settings = await saveRuntimeSettings(next);
      console.info(JSON.stringify({ event: 'admin.settings_changed', settings }));
      res.json({ settings, authenticationActive: next.loginEnabled || next.registrationEnabled });
    } catch (error) {
      console.error('Admin settings save failed:', error.name);
      res.status(500).json({ error: 'Postavke nisu spremljene.' });
    }
  }
);

export default router;
