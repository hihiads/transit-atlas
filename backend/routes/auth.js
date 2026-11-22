import express from 'express';
import { body, validationResult } from 'express-validator';
import User from '../models/User.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../utils/crypto.js';
import { verifyTurnstile } from '../middleware/turnstile.js';
import { requireAuth } from '../middleware/auth.js';
import { sendParentalConsentEmail, sendPasswordResetEmail, sendVerificationEmail } from '../services/email.js';
import PendingRegistration from '../models/PendingRegistration.js';
import { randomBytes } from 'crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getRuntimeSettings, isAuthenticationEnabled } from '../config/runtimeSettings.js';
import { requireTrustedOrigin } from '../config/origins.js';
import { asyncRoute, emailActionLimiter } from '../middleware/security.js';
import { deleteUserSessions } from '../services/authRuntime.js';

const router = express.Router();
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const TERMS_VERSION = '2026-11-22-zet-hzpp';
const registrationMessage = 'Ako se račun može otvoriti ili treba dodatnu potvrdu, provjerite email.';
const verificationLifetime = 24 * 60 * 60 * 1000;

async function deliverVerification(email, token) {
  try {
    return await sendVerificationEmail(email, token);
  } catch (error) {
    await User.updateOne({ email, emailVerificationToken: hashToken(token) }, {
      $set: { emailVerificationToken: null, emailVerificationExpires: null }
    });
    throw error;
  }
}

async function requestParentConsent({ email, guardianEmail, passwordHash = null, googleSubject = null }) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  try {
    await PendingRegistration.updateOne({ email, expiresAt: { $lte: new Date() } }, {
      $set: {
        email, guardianEmail, passwordHash, googleSubject, tokenHash,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    }, { upsert: true, runValidators: true });
  } catch (error) {
    if (error.code === 11000) return { message: registrationMessage };
    throw error;
  }
  let sent;
  try {
    sent = await sendParentalConsentEmail(guardianEmail, token);
  } catch (error) {
    await PendingRegistration.deleteOne({ email, tokenHash });
    throw error;
  }
  return {
    message: registrationMessage,
    ...(process.env.NODE_ENV !== 'production' ? { parentConsentRequired: true, ...(!sent ? { parentConsentToken: token } : {}) } : {})
  };
}

const tokenPattern = /^[a-f0-9]{64}$/;
const actionToken = () => body('token').isString().bail().matches(tokenPattern);
const emailInput = () => body('email').isString().bail().trim().isLength({ max: 255 }).isEmail().bail().normalizeEmail();
const newPassword = () => body('password').isString().bail().isLength({ min: 8, max: 128 })
  .withMessage('Lozinka mora imati između 8 i 128 znakova.');
const guardianEmailInput = when => body('guardianEmail').if(when)
  .isString().bail().trim().isLength({ max: 255 }).isEmail().bail().normalizeEmail()
  .withMessage('Unesite ispravnu email adresu roditelja ili skrbnika.');

const requireSetting = name => (req, res, next) => {
  if (!getRuntimeSettings()[name]) return res.status(403).json({ error: 'Ova značajka trenutačno nije dostupna.' });
  next();
};

const requireLogin = requireSetting('loginEnabled');
const requireRegistration = requireSetting('registrationEnabled');

function requireSession(req, res, next) {
  if (!isAuthenticationEnabled() || !req.session) return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
  next();
}

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use(requireTrustedOrigin);

router.get('/status', (req, res) => res.json({ ...getRuntimeSettings(), authenticationActive: isAuthenticationEnabled() }));

router.get('/providers', (req, res) => {
  const settings = getRuntimeSettings();
  const canSignIn = settings.loginEnabled || settings.registrationEnabled;
  res.json({
    google: canSignIn && settings.googleEnabled && Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientId: canSignIn && settings.googleEnabled ? process.env.GOOGLE_CLIENT_ID || null : null
  });
});

router.post('/oauth/challenge', requireSession,
  body('provider').isString().bail().equals('google'),
  body('intent').optional().isIn(['login', 'register']),
  asyncRoute(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Provjerite podatke za Google prijavu.' });
    const { provider } = req.body;
    const intent = req.body.intent === 'register' ? 'register' : 'login';
    const settings = getRuntimeSettings();
    if (intent === 'register' && !settings.registrationEnabled) return res.status(403).json({ error: 'Registracija trenutačno nije dostupna.' });
    if (intent === 'login' && !settings.loginEnabled) return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
    if (!settings.googleEnabled || !process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ error: 'Ova prijava trenutačno nije postavljena.' });
    }
    const challenge = { nonce: randomBytes(32).toString('base64url'), state: randomBytes(24).toString('base64url'), expires: Date.now() + 5 * 60 * 1000 };
    const existing = req.session.oauthChallenges?.[provider];
    const previousChallenges = Array.isArray(existing) ? existing : existing ? [existing] : [];
    req.session.oauthChallenges = {
      ...req.session.oauthChallenges,
      [provider]: [...previousChallenges.filter(item => item.expires > Date.now()), { ...challenge, intent }].slice(-5)
    };
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.json(challenge);
  })
);

router.post('/oauth/:provider',
  requireSession,
  body('idToken').isString().bail().isJWT(),
  body('intent').isString().bail().isIn(['login', 'register']),
  body('ageRange').optional().isIn(['10-15', '16+']),
  body('termsAccepted').optional().isBoolean(),
  guardianEmailInput((value, { req }) => req.body?.intent === 'register' && req.body.ageRange === '10-15'),
  async (req, res) => {
    const provider = req.params.provider;
    if (provider !== 'google') return res.status(404).json({ error: 'Nepoznata prijava.' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Prijava nije uspjela. Pokušajte ponovno.' });

    try {
      if (!getRuntimeSettings().googleEnabled) return res.status(403).json({ error: 'Ova prijava trenutačno nije dostupna.' });
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: 'Ova prijava trenutačno nije postavljena.' });
      const verified = await jwtVerify(req.body.idToken, googleKeys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: clientId,
        algorithms: ['RS256'],
        requiredClaims: ['exp', 'sub', 'iat']
      });
      const claims = verified.payload;
      if (typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' ||
          (claims.email_verified !== true && claims.email_verified !== 'true')) {
        return res.status(401).json({ error: 'Račun nije moguće potvrditi kod pružatelja prijave.' });
      }

      const existing = req.session.oauthChallenges?.[provider];
      const challenges = Array.isArray(existing) ? existing : existing ? [existing] : [];
      const challenge = challenges.find(item => item.nonce === claims.nonce && item.expires >= Date.now());
      if (!challenge || challenge.intent !== req.body.intent) {
        return res.status(401).json({ error: 'Prijava je istekla. Pokušajte ponovno.' });
      }
      req.session.oauthChallenges[provider] = challenges.filter(item => item.nonce !== challenge.nonce);
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));

      const intent = req.body.intent;
      const ageRange = intent === 'register' ? req.body.ageRange : '';
      const guardianEmail = intent === 'register' && ageRange === '10-15' ? req.body.guardianEmail : '';
      const termsAccepted = intent === 'register' && req.body.termsAccepted === true;
      if (intent === 'register' && (!termsAccepted || !['10-15', '16+'].includes(ageRange))) {
        return res.status(400).json({ error: 'Prihvatite uvjete i odaberite dobnu skupinu.' });
      }

      const email = claims.email.toLowerCase();
      if (ageRange === '10-15' && guardianEmail === email) return res.status(400).json({ error: 'Za roditeljsku potvrdu unesite email koji se razlikuje od Google emaila.' });
      let user = await User.findOne({ googleSubject: claims.sub });
      const settings = getRuntimeSettings();
      if (user) {
        if (!settings.loginEnabled || !user.emailVerified) {
          return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
        }
      } else {
        if (intent !== 'register' || !settings.registrationEnabled) {
          return res.status(404).json({ error: 'Google račun još nije registriran. Otvorite registraciju i prihvatite uvjete.' });
        }
        if (await User.exists({ email })) {
          return res.status(409).json({ error: 'Za ovu adresu koristite postojeći način prijave.' });
        }
        if (!email.endsWith('@gmail.com') && !(typeof claims.hd === 'string' && claims.hd)) {
          return res.status(403).json({ error: 'Za ovu adresu registrirajte se emailom i potvrdite poveznicu iz sandučića.' });
        }
        if (ageRange === '10-15') {
          const result = await requestParentConsent({ email, guardianEmail, googleSubject: claims.sub });
          return res.json(result);
        }
        if (ageRange !== '16+' || !termsAccepted) return res.status(400).json({ error: 'Registracija nije dovršena. Prihvatite uvjete i odaberite dobnu skupinu.' });
        user = await User.create({
          email,
          emailVerified: true,
          googleSubject: claims.sub,
          passwordHash: await hashPassword(randomBytes(48).toString('hex')),
          ageRange,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date()
        });
      }

      if (!getRuntimeSettings().loginEnabled) {
        return res.json({ message: 'Račun je kreiran. Prijava trenutačno nije dostupna.' });
      }

      req.session.regenerate(error => {
        if (error) return res.status(500).json({ error: 'Prijava nije uspjela.' });
        req.session.userId = user._id.toString();
        req.session.sessionVersion = user.sessionVersion || 0;
        req.session.save(saveError => {
          if (saveError) return res.status(500).json({ error: 'Prijava nije uspjela.' });
          res.json({ message: 'Prijavljeni ste.', user: { id: user._id, email: user.email, emailVerified: true } });
        });
      });
    } catch (error) {
      console.error('Google sign-in failed:', error.name);
      res.status(401).json({ error: 'Prijava nije uspjela. Pokušajte ponovno.' });
    }
  }
);

// Registracija
router.post('/register',
  requireRegistration,
  emailInput(),
  emailActionLimiter({ maxByIp: 15, maxByEmail: 5 }),
  verifyTurnstile('register'),
  newPassword(),
  body('termsAccepted').custom(value => value === true).withMessage('Prihvatite uvjete korištenja za nastavak'),
  body('ageRange').isString().bail().isIn(['10-15', '16+']).withMessage('Odaberite dobnu skupinu'),
  guardianEmailInput((value, { req }) => req.body?.ageRange === '10-15'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, ageRange, guardianEmail } = req.body;
    if (ageRange === '10-15' && guardianEmail === email) {
      return res.status(400).json({ error: 'Email skrbnika mora se razlikovati od emaila djeteta.' });
    }

    try {
      // Provjeri postoji li korisnik (vremenska konzistentnost da bi se spriječila enumeracija)
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        if (!existingUser.emailVerified) {
          const token = generateToken();
          const result = await User.updateOne({
            _id: existingUser._id,
            emailVerified: false,
            $or: [{ emailVerificationExpires: null }, { emailVerificationExpires: { $lte: new Date() } }]
          }, {
            $set: { emailVerificationToken: hashToken(token), emailVerificationExpires: new Date(Date.now() + verificationLifetime) }
          });
          if (result.modifiedCount === 1) {
            const emailSent = await deliverVerification(email, token);
            if (process.env.NODE_ENV !== 'production' && !emailSent) {
              return res.status(202).json({ message: registrationMessage, verificationToken: token });
            }
          }
        }
        return res.status(202).json({ message: registrationMessage });
      }

      const passwordHash = await hashPassword(password);
      if (ageRange === '10-15') {
        const result = await requestParentConsent({ email, guardianEmail, passwordHash });
        return res.status(202).json(result);
      }

      // Generiraj verifikacijski token
      const verificationToken = generateToken();
      const hashedToken = hashToken(verificationToken);

      const user = new User({
        email,
        passwordHash,
        ageRange,
        termsVersion: TERMS_VERSION,
        termsAcceptedAt: new Date(),
        emailVerificationToken: hashedToken,
        emailVerificationExpires: new Date(Date.now() + verificationLifetime)
      });

      await user.save();

      const emailSent = await deliverVerification(email, verificationToken);
      res.status(202).json({
        message: registrationMessage,
        ...(process.env.NODE_ENV !== 'production' && !emailSent ? { verificationToken } : {})
      });
    } catch (error) {
      if (error.code === 11000) return res.status(202).json({ message: registrationMessage });
      console.error('Registration error:', error.name);
      res.status(500).json({ error: 'Greška pri registraciji' });
    }
  }
);

// Prijava
router.post('/login',
  requireLogin,
  requireSession,
  emailInput(),
  body('password').isString().bail().isLength({ min: 1, max: 128 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Neispravni podaci' });
    }

    const { email, password } = req.body;

    try {
      // Vremenska konzistentnost protiv enumeracije
      const user = await User.findOne({ email });

      if (!user) {
        // Dodaj lažnu hash provjeru da traje isto vremena
        await hashPassword('dummy-password').catch(() => {});
        return res.status(401).json({ error: 'Neispravni podaci' });
      }

      const isValid = await verifyPassword(password, user.passwordHash);

      if (!isValid) {
        return res.status(401).json({ error: 'Neispravni podaci' });
      }

      if (!user.emailVerified) {
        return res.status(403).json({ error: 'Potvrdite email adresu prije prijave.' });
      }

      // Regeneriraj sesiju za zaštitu od fiksacije
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regeneration error:', err.name);
          return res.status(500).json({ error: 'Greška pri prijavi' });
        }

        req.session.userId = user._id.toString();
        req.session.sessionVersion = user.sessionVersion || 0;
        req.session.save(saveError => {
          if (saveError) return res.status(500).json({ error: 'Greška pri prijavi' });
          res.json({
            message: 'Uspješna prijava',
            user: {
              id: user._id,
              email: user.email,
              emailVerified: user.emailVerified
            }
          });
        });
      });
    } catch (error) {
      console.error('Login error:', error.name);
      res.status(500).json({ error: 'Greška pri prijavi' });
    }
  }
);

// Odjava
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err.name);
        return res.status(500).json({ error: 'Greška pri odjavi' });
      }
      res.clearCookie('sessionId', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      res.json({ message: 'Uspješna odjava' });
    });
  } else {
    res.json({ message: 'Uspješna odjava' });
  }
});

router.post('/parent-consent', requireRegistration, actionToken(), body('consent').custom(value => value === true), async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Poveznica nije ispravna ili je istekla.' });
  try {
    const pending = await PendingRegistration.findOne({ tokenHash: hashToken(req.body.token), expiresAt: { $gt: new Date() } });
    if (!pending) return res.status(400).json({ error: 'Poveznica nije ispravna ili je istekla.' });
    if (await User.exists({ email: pending.email })) {
      await pending.deleteOne();
      return res.status(409).json({ error: 'Za ovu email adresu već postoji račun. Pokušajte se prijaviti.' });
    }
    const verificationToken = pending.googleSubject ? null : generateToken();
    const user = await User.create({
      email: pending.email,
      passwordHash: pending.passwordHash || await hashPassword(randomBytes(48).toString('hex')),
      ...(pending.googleSubject ? { googleSubject: pending.googleSubject } : {}),
      emailVerified: Boolean(pending.googleSubject),
      ageRange: '10-15',
      guardianEmail: pending.guardianEmail,
      guardianConsentAt: new Date(),
      termsVersion: pending.termsVersion,
      termsAcceptedAt: pending.termsAcceptedAt,
      ...(verificationToken ? { emailVerificationToken: hashToken(verificationToken), emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) } : {})
    });
    if (verificationToken) {
      let sent;
      try {
        sent = await sendVerificationEmail(user.email, verificationToken);
      } catch (error) {
        await user.deleteOne();
        throw error;
      }
      await pending.deleteOne();
      return res.json({ message: sent ? 'Suglasnost je potvrđena. Sada provjerite djetetov email kako biste dovršili registraciju.' : 'Suglasnost je potvrđena. Email djeteta treba potvrditi.', ...(!sent && process.env.NODE_ENV !== 'production' ? { verificationToken } : {}) });
    }
    await pending.deleteOne();
    res.json({ message: 'Suglasnost je potvrđena. Dijete se sada može prijaviti Google računom.' });
  } catch (error) {
    console.error('Parent consent error:', error.name);
    res.status(500).json({ error: 'Potvrda suglasnosti nije uspjela. Pokušajte ponovno.' });
  }
});

router.post('/parent-consent/preview', requireRegistration, actionToken(), async (req, res) => {
  if (!validationResult(req).isEmpty()) return res.status(400).json({ error: 'Poveznica nije ispravna ili je istekla.' });
  try {
    const pending = await PendingRegistration.findOne({ tokenHash: hashToken(req.body.token), expiresAt: { $gt: new Date() } }).select('email');
    if (!pending) return res.status(400).json({ error: 'Poveznica nije ispravna ili je istekla.' });
    res.json({ childEmail: pending.email });
  } catch (error) {
    res.status(500).json({ error: 'Nije moguće učitati zahtjev za suglasnost.' });
  }
});

// Dohvati trenutnog korisnika
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    await deleteUserSessions(req.session.userId);
    await User.findByIdAndDelete(req.session.userId);
    req.session.destroy(error => {
      if (error) return next(error);
      res.clearCookie('sessionId', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      res.json({ message: 'Račun i njegovi podaci su izbrisani.' });
    });
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireLogin, requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-passwordHash -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Get user error:', error.name);
    res.status(500).json({ error: 'Greška pri dohvaćanju korisnika' });
  }
});

// Verifikacija emaila
router.post('/verify-email',
  requireSession,
  actionToken(),
  body('password').isString().bail().isLength({ min: 1, max: 128 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Neispravan token' });
    }

    try {
      const filter = () => ({
        emailVerificationToken: hashToken(req.body.token),
        emailVerificationExpires: { $gt: new Date() },
        emailVerified: false
      });
      const user = await User.findOne(filter()).select('passwordHash');
      if (!user || !await verifyPassword(req.body.password, user.passwordHash)) {
        return res.status(400).json({ error: 'Poveznica ili lozinka nije ispravna.' });
      }

      const result = await User.updateOne({ _id: user._id, ...filter(), passwordHash: user.passwordHash }, {
        $set: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null }
      });
      if (result.modifiedCount !== 1) {
        return res.status(400).json({ error: 'Token je neispravan ili je istekao' });
      }

      res.json({ message: 'Email uspješno verificiran' });
    } catch (error) {
      console.error('Email verification error:', error.name);
      res.status(500).json({ error: 'Greška pri verifikaciji' });
    }
  }
);

// Zahtjev za reset lozinke
router.post('/forgot-password',
  requireLogin,
  emailInput(),
  emailActionLimiter({ maxByIp: 15, maxByEmail: 5 }),
  verifyTurnstile('forgot_password'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Uvijek vrati uspjeh protiv enumeracije
      return res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    }

    const { email } = req.body;

    try {
      const resetToken = generateToken();
      const hashedToken = hashToken(resetToken);
      const user = await User.findOneAndUpdate({
        email,
        emailVerified: true,
        $or: [{ passwordResetExpires: null }, { passwordResetExpires: { $lte: new Date() } }]
      }, {
        $set: { passwordResetToken: hashedToken, passwordResetExpires: new Date(Date.now() + 60 * 60 * 1000) }
      }).select('_id');

      if (user) {
        let emailSent;
        try {
          emailSent = await sendPasswordResetEmail(email, resetToken);
        } catch (error) {
          await User.updateOne({ _id: user._id, passwordResetToken: hashedToken }, {
            $set: { passwordResetToken: null, passwordResetExpires: null }
          });
          throw error;
        }
        if (process.env.NODE_ENV !== 'production' && !emailSent) {
          return res.json({ message: 'Lokalni SMTP nije postavljen.', resetToken });
        }
      }

      // Uvijek vrati uspjeh protiv enumeracije
      res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    } catch (error) {
      console.error('Forgot password error:', error.name);
      res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    }
  }
);

// Reset lozinke
router.post('/reset-password',
  requireLogin,
  actionToken(),
  newPassword(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { token, password } = req.body;
    try {
      const hashedToken = hashToken(token);
      const resetFilter = () => ({ passwordResetToken: hashedToken, passwordResetExpires: { $gt: new Date() } });
      const user = await User.exists(resetFilter());
      if (!user) return res.status(400).json({ error: 'Token je neispravan ili je istekao' });

      const passwordHash = await hashPassword(password);
      const result = await User.updateOne({ _id: user._id, ...resetFilter() }, {
        $set: { passwordHash, passwordResetToken: null, passwordResetExpires: null },
        $inc: { sessionVersion: 1 }
      });
      if (result.modifiedCount !== 1) return res.status(400).json({ error: 'Token je neispravan ili je istekao' });

      res.json({ message: 'Lozinka uspješno promijenjena. Prijavite se s novom lozinkom.' });
    } catch (error) {
      console.error('Reset password error:', error.name);
      res.status(500).json({ error: 'Greška pri promjeni lozinke' });
    }
  }
);

export default router;
