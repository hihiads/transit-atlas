import { hasStrongAdminPassword, isDev } from '../config/env.js';
import { createHash, timingSafeEqual, randomBytes, randomUUID } from 'crypto';
import express from 'express';
import { body, validationResult } from 'express-validator';
import { getRuntimeSettings, isAuthenticationEnabled, missingAuthenticationEnvironment, saveRuntimeSettings } from '../config/runtimeSettings.js';
import { activateAuthentication } from '../services/authRuntime.js';
import { adminLimiter, adminTotpLimiter, asyncRoute } from '../middleware/security.js';
import { requireTrustedOrigin } from '../config/origins.js';
import { requireAdminAccess } from '../middleware/adminAccess.js';
import { adminTotpConfigured, consumeAdminTotp } from '../middleware/adminTotp.js';
import dashboardRoutes from './dashboard.js';
import { auditDashboard } from '../services/dashboard.js';
import { readAnnouncement, publishAnnouncement, unpublishAnnouncement } from '../services/siteAnnouncement.js';

const router = express.Router();
const cookieName = 'transit-admin';
const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: !isDev, path: '/api/admin', maxAge: 30 * 60 * 1000 };

const adminSessions = new Map();

function sessionKey(req) {
  const token = (req.headers.cookie || '').split(/;\s*/).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : undefined;
}

function requireAdmin(req, res, next) {
  const key = sessionKey(req);
  const session = adminSessions.get(key);
  if (!session || session.expiresAt <= Date.now()) {
    adminSessions.delete(key);
    return res.status(401).json({ error: 'Prijavite se u administratorski panel.' });
  }
  req.adminSessionKey = key;
  next();
}

router.use(requireAdminAccess);
router.use((req, res, next) => {
  if (isDev) return requireTrustedOrigin(req, res, next);
  const origin = req.get('origin');
  if (origin === `https://${process.env.ADMIN_HOST?.trim().toLowerCase()}` ||
      (!origin && ['GET', 'HEAD', 'OPTIONS'].includes(req.method))) return next();
  res.sendStatus(403);
});
router.use(express.json({ limit: '10kb' }), express.urlencoded({ extended: true, limit: '10kb' }));

router.post('/login', adminLimiter, body('password').isString().isLength({ min: 1, max: 256 }), (req, res, next) => {
  if (!adminTotpConfigured || !hasStrongAdminPassword()) {
    return res.status(503).json({ error: 'Administratorska prijava nije konfigurirana.' });
  }
  const errors = validationResult(req);
  const supplied = createHash('sha256').update(errors.isEmpty() ? req.body.password : '').digest();
  const expected = createHash('sha256').update(process.env.ADMIN_PANEL_PASSWORD).digest();
  if (!errors.isEmpty() || !timingSafeEqual(supplied, expected)) {
    console.info(JSON.stringify({ event: 'admin.login', outcome: 'failure' }));
    return res.status(401).json({ error: 'Lozinka nije ispravna.' });
  }
  next();
}, adminTotpLimiter, (req, res) => {
  if (!consumeAdminTotp(req.body.code)) {
    console.info(JSON.stringify({ event: 'admin.login', outcome: 'failure' }));
    return res.status(401).json({ error: 'Kod iz aplikacije za autentifikaciju nije ispravan ili je već iskorišten.' });
  }
  const now = Date.now();
  for (const [key, session] of adminSessions) {
    if (session.expiresAt <= now) adminSessions.delete(key);
  }
  adminSessions.delete(sessionKey(req));
  if (adminSessions.size >= 100) {
    return res.status(503).json({ error: 'Previše aktivnih administratorskih sesija.' });
  }
  const token = randomBytes(32).toString('hex');
  adminSessions.set(createHash('sha256').update(token).digest('hex'), {
    id: randomUUID(),
    createdAt: now,
    browser: (req.get('user-agent') || '').slice(0, 160),
    expiresAt: now + cookieOptions.maxAge
  });
  console.info(JSON.stringify({ event: 'admin.login', outcome: 'success' }));
  res.cookie(cookieName, token, cookieOptions).json({ message: 'Prijavljeni ste.' });
});

router.use(requireAdmin);
router.use('/dashboard', dashboardRoutes);

router.get('/sessions', (req, res) => {
  const now = Date.now();
  res.json([...adminSessions].filter(([, session]) => session.expiresAt > now).map(([key, session]) => ({
    ...session, current: key === req.adminSessionKey
  })));
});

router.delete('/sessions/others', asyncRoute(async (req, res) => {
  for (const [key] of adminSessions) if (key !== req.adminSessionKey) adminSessions.delete(key);
  await auditDashboard('sessions.revoke_others');
  res.sendStatus(204);
}));

router.delete('/sessions/:id', asyncRoute(async (req, res) => {
  const pair = [...adminSessions].find(([, session]) => session.id === req.params.id);
  if (!pair) return res.sendStatus(404);
  adminSessions.delete(pair[0]);
  if (pair[0] === req.adminSessionKey) {
    const { maxAge, ...clearOptions } = cookieOptions;
    res.clearCookie(cookieName, clearOptions);
  }
  await auditDashboard('sessions.revoke');
  res.sendStatus(204);
}));

router.get('/announcement', asyncRoute(async (req, res) => {
  res.json({ announcement: await readAnnouncement() });
}));

router.put('/announcement',
  body('text').isString().bail().trim().isLength({ min: 1, max: 280 }),
  body('level').isString().bail().isIn(['info', 'warning']),
  body('expiresAt').custom(value => value === null || (typeof value === 'string' && Date.parse(value) > Date.now())),
  asyncRoute(async (req, res) => {
    if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Unesite poruku i odaberite vrijeme isteka u budućnosti.' });
    if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'Za objavu najava potrebna je MongoDB veza.' });
    const announcement = await publishAnnouncement(req.body);
    await auditDashboard('announcement.publish');
    console.info(JSON.stringify({ event: 'admin.announcement_published' }));
    res.json({ announcement });
  })
);

router.delete('/announcement', asyncRoute(async (req, res) => {
  if (!process.env.MONGODB_URI) return res.status(503).json({ error: 'Za objavu najava potrebna je MongoDB veza.' });
  await unpublishAnnouncement();
  await auditDashboard('announcement.withdraw');
  console.info(JSON.stringify({ event: 'admin.announcement_unpublished' }));
  res.json({ announcement: null });
}));

router.post('/logout', (req, res) => {
  if (adminSessions.delete(sessionKey(req))) {
    console.info(JSON.stringify({ event: 'admin.logout', outcome: 'success' }));
  }
  const { maxAge, ...clearOptions } = cookieOptions;
  res.clearCookie(cookieName, clearOptions).json({ message: 'Odjavljeni ste.' });
});

router.get('/settings', (req, res) => res.json({
  settings: getRuntimeSettings(),
  authenticationActive: isAuthenticationEnabled(),
  missingEnvironment: []
}));

router.patch('/settings',
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
      await auditDashboard('auth.settings');
      console.info(JSON.stringify({ event: 'admin.settings_changed', settings }));
      res.json({ settings, authenticationActive: next.loginEnabled || next.registrationEnabled });
    } catch (error) {
      console.error('Admin settings save failed:', error.name);
      res.status(500).json({ error: 'Postavke nisu spremljene.' });
    }
  }
);

export default router;
