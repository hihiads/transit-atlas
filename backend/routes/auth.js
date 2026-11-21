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
import { isAllowedOrigin } from '../config/origins.js';
import { deleteUserSessions } from '../services/authRuntime.js';

const router = express.Router();
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const TERMS_VERSION = '2026-11-22';

async function requestParentConsent({ email, guardianEmail, passwordHash = null, googleSubject = null }) {
  const token = generateToken();
  await PendingRegistration.findOneAndUpdate({ email }, {
    email, guardianEmail, passwordHash, googleSubject,
    tokenHash: hashToken(token),
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
  const sent = await sendParentalConsentEmail(guardianEmail, token);
  return {
    message: 'Ako se račun može otvoriti ili treba dodatnu potvrdu, vidjet ćete daljnje upute.',
    ...(process.env.NODE_ENV !== 'production' ? { parentConsentRequired: true, ...(!sent ? { parentConsentToken: token } : {}) } : {})
  };
}

router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && !isAllowedOrigin(origin)) return res.status(403).json({ error: 'Zahtjev nije dopušten' });
  next();
});

router.get('/status', (req, res) => res.json({ ...getRuntimeSettings(), authenticationActive: isAuthenticationEnabled() }));

router.get('/providers', (req, res) => {
  const settings = getRuntimeSettings();
  const canSignIn = settings.loginEnabled || settings.registrationEnabled;
  res.json({
    google: canSignIn && settings.googleEnabled && Boolean(process.env.GOOGLE_CLIENT_ID),
    googleClientId: canSignIn && settings.googleEnabled ? process.env.GOOGLE_CLIENT_ID || null : null
  });
});

router.use((req, res, next) => {
  const settings = getRuntimeSettings();
  if (req.path === '/logout' || req.path === '/status' || req.path === '/providers' || req.path === '/parent-consent') return next();
  if (!isAuthenticationEnabled()) return res.status(403).json({ error: 'Prijava i registracija trenutačno su isključene.' });
  if (req.path === '/login' && !settings.loginEnabled) return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
  if (req.path === '/register' && !settings.registrationEnabled) return res.status(403).json({ error: 'Registracija trenutačno nije dostupna.' });
  if (['/forgot-password', '/reset-password', '/me'].includes(req.path) && !settings.loginEnabled) return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
  if (req.path.startsWith('/oauth/') && !settings.loginEnabled && !settings.registrationEnabled) return res.status(403).json({ error: 'Prijava i registracija trenutačno su isključene.' });
  next();
});

router.post('/oauth/challenge', body('provider').equals('google'), async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Odaberite dostupnu prijavu.' });
  const { provider } = req.body;
  const intent = req.body.intent === 'register' ? 'register' : 'login';
  const ageRange = req.body.ageRange;
  const guardianEmail = typeof req.body.guardianEmail === 'string' ? req.body.guardianEmail.trim().toLowerCase() : '';
  if (intent === 'register' && (req.body.termsAccepted !== true || !['10-15', '16+'].includes(ageRange) || (ageRange === '10-15' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guardianEmail)))) {
    return res.status(400).json({ error: 'Prihvatite uvjete i unesite dobnu skupinu te email roditelja/skrbnika ako imate 10–15 godina.' });
  }
  const settings = getRuntimeSettings();
  if (intent === 'register' && !settings.registrationEnabled) return res.status(403).json({ error: 'Registracija trenutačno nije dostupna.' });
  if (!settings.googleEnabled || !process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Ova prijava trenutačno nije postavljena.' });
  }
  const challenge = { nonce: randomBytes(32).toString('base64url'), state: randomBytes(24).toString('base64url'), expires: Date.now() + 5 * 60 * 1000 };
  req.session.oauthChallenges = { ...req.session.oauthChallenges, [provider]: { ...challenge, intent, ageRange, guardianEmail, termsAccepted: req.body.termsAccepted === true } };
  res.json(challenge);
});

router.post('/oauth/:provider',
  body('idToken').isJWT(),
  async (req, res) => {
    const provider = req.params.provider;
    if (provider !== 'google') return res.status(404).json({ error: 'Nepoznata prijava.' });
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Prijava nije uspjela. Pokušajte ponovno.' });

    const challenge = req.session.oauthChallenges?.[provider];
    delete req.session.oauthChallenges?.[provider];
    try {
      await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
      if (!challenge || challenge.expires < Date.now()) {
        return res.status(401).json({ error: 'Prijava je istekla. Pokušajte ponovno.' });
      }

      if (!getRuntimeSettings().googleEnabled) return res.status(403).json({ error: 'Ova prijava trenutačno nije dostupna.' });
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: 'Ova prijava trenutačno nije postavljena.' });
      const verified = await jwtVerify(req.body.idToken, googleKeys, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: clientId,
        algorithms: ['RS256']
      });
      const claims = verified.payload;
      if (claims.nonce !== challenge.nonce || !claims.sub || typeof claims.email !== 'string' ||
          (claims.email_verified !== true && claims.email_verified !== 'true')) {
        return res.status(401).json({ error: 'Račun nije moguće potvrditi kod pružatelja prijave.' });
      }

      const email = claims.email.toLowerCase();
      if (challenge.ageRange === '10-15' && challenge.guardianEmail === email) return res.status(400).json({ error: 'Za roditeljsku potvrdu unesite email koji se razlikuje od Google emaila.' });
      const subjectField = 'googleSubject';
      let user = await User.findOne({ [subjectField]: claims.sub });
      const emailUser = await User.findOne({ email });
      if (user && emailUser && String(user._id) !== String(emailUser._id)) {
        return res.status(409).json({ error: 'Ovaj račun već je povezan s drugom prijavom.' });
      }
      user ||= emailUser;
      const settings = getRuntimeSettings();
      if (user && !settings.loginEnabled) return res.status(403).json({ error: 'Prijava trenutačno nije dostupna.' });
      if (!user && (challenge.intent !== 'register' || !settings.registrationEnabled)) return res.status(404).json({ error: 'Google račun još nije registriran. Otvorite registraciju i prihvatite uvjete.' });
      if (user) {
        if (user[subjectField] && user[subjectField] !== claims.sub) {
          return res.status(409).json({ error: 'Ovaj email već koristi drugi račun.' });
        }
        user[subjectField] = claims.sub;
        user.emailVerified = true;
        await user.save();
      } else {
        if (challenge.ageRange === '10-15') {
          const result = await requestParentConsent({ email, guardianEmail: challenge.guardianEmail, googleSubject: claims.sub });
          return res.json(result);
        }
        if (challenge.ageRange !== '16+' || !challenge.termsAccepted) return res.status(400).json({ error: 'Registracija nije dovršena. Prihvatite uvjete i odaberite dobnu skupinu.' });
        user = await User.create({
          email,
          emailVerified: true,
          [subjectField]: claims.sub,
          passwordHash: await hashPassword(randomBytes(48).toString('hex')),
          ageRange: challenge.ageRange,
          termsVersion: TERMS_VERSION,
          termsAcceptedAt: new Date()
        });
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
      console.error(`${provider} sign-in failed:`, error.message);
      res.status(401).json({ error: 'Prijava nije uspjela. Pokušajte ponovno.' });
    }
  }
);

// Registracija
router.post('/register',
  verifyTurnstile,
  body('email')
    .trim()
    .isEmail()
    .withMessage('Neispravna email adresa')
    .normalizeEmail()
    .isLength({ max: 255 })
    .withMessage('Email adresa predugačka'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Lozinka mora imati najmanje 8 znakova'),
  body('termsAccepted').custom(value => value === true).withMessage('Prihvatite uvjete korištenja za nastavak'),
  body('ageRange').isIn(['10-15', '16+']).withMessage('Odaberite dobnu skupinu'),
  body('guardianEmail').custom((value, { req }) => req.body.ageRange !== '10-15' || (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.trim().toLowerCase() !== String(req.body.email).trim().toLowerCase())).withMessage('Unesite email roditelja ili skrbnika koji se razlikuje od emaila djeteta'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { email, password, ageRange, guardianEmail } = req.body;

    try {
      // Provjeri postoji li korisnik (vremenska konzistentnost da bi se spriječila enumeracija)
      const existingUser = await User.findOne({ email });

      if (existingUser) {
        if (!existingUser.emailVerified) {
          const token = generateToken();
          existingUser.emailVerificationToken = hashToken(token);
          existingUser.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await existingUser.save();
          await sendVerificationEmail(email, token);
        }
        return res.status(202).json({ message: 'Ako se račun može otvoriti ili treba dodatnu potvrdu, vidjet ćete daljnje upute.' });
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
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
      });

      await user.save();

      const emailSent = await sendVerificationEmail(email, verificationToken);
      res.status(201).json({
        message: emailSent ? 'Račun je kreiran. Provjerite email za poveznicu za potvrdu.' : 'Račun je kreiran. Email nije poslan jer lokalni SMTP nije postavljen.',
        ...(process.env.NODE_ENV !== 'production' && !emailSent ? { verificationToken } : {})
      });
    } catch (error) {
      console.error('Registration error:', error.message);
      res.status(500).json({ error: 'Greška pri registraciji' });
    }
  }
);

// Prijava
router.post('/login',
  body('email').trim().isEmail().normalizeEmail(),
  body('password').notEmpty(),
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
          console.error('Session regeneration error:', err);
          return res.status(500).json({ error: 'Greška pri prijavi' });
        }

        req.session.userId = user._id.toString();
        req.session.sessionVersion = user.sessionVersion || 0;

        res.json({
          message: 'Uspješna prijava',
          user: {
            id: user._id,
            email: user.email,
            emailVerified: user.emailVerified
          }
        });
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Greška pri prijavi' });
    }
  }
);

// Odjava
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Greška pri odjavi' });
      }
      res.clearCookie('sessionId', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
      res.json({ message: 'Uspješna odjava' });
    });
  } else {
    res.json({ message: 'Uspješna odjava' });
  }
});

router.post('/parent-consent', body('token').isLength({ min: 64, max: 64 }), body('consent').custom(value => value === true), async (req, res) => {
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
    console.error('Parent consent error:', error.message);
    res.status(500).json({ error: 'Potvrda suglasnosti nije uspjela. Pokušajte ponovno.' });
  }
});

router.get('/parent-consent', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const token = req.query.token;
  if (typeof token !== 'string' || token.length !== 64) return res.status(400).json({ error: 'Poveznica nije ispravna ili je istekla.' });
  try {
    const pending = await PendingRegistration.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).select('email');
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

router.get('/me', requireAuth, async (req, res) => {
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
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Greška pri dohvaćanju korisnika' });
  }
});

// Verifikacija emaila
router.post('/verify-email',
  body('token').isLength({ min: 64, max: 64 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Neispravan token' });
    }

    const { token } = req.body;
    const hashedToken = hashToken(token);

    try {
      const user = await User.findOne({
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ error: 'Token je neispravan ili je istekao' });
      }

      user.emailVerified = true;
      user.emailVerificationToken = null;
      user.emailVerificationExpires = null;
      await user.save();

      res.json({ message: 'Email uspješno verificiran' });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Greška pri verifikaciji' });
    }
  }
);

// Zahtjev za reset lozinke
router.post('/forgot-password',
  verifyTurnstile,
  body('email').trim().isEmail().normalizeEmail(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Uvijek vrati uspjeh protiv enumeracije
      return res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    }

    const { email } = req.body;

    try {
      const user = await User.findOne({ email });

      if (user) {
        const resetToken = generateToken();
        const hashedToken = hashToken(resetToken);

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
        await user.save();

        const emailSent = await sendPasswordResetEmail(email, resetToken);
        if (process.env.NODE_ENV !== 'production' && !emailSent) {
          return res.json({ message: 'Lokalni SMTP nije postavljen.', resetToken });
        }
      }

      // Uvijek vrati uspjeh protiv enumeracije
      res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.json({ message: 'Ako račun postoji, poslat će se email s uputama.' });
    }
  }
);

// Reset lozinke
router.post('/reset-password',
  body('token').isLength({ min: 64, max: 64 }),
  body('password').isLength({ min: 8, max: 128 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }

    const { token, password } = req.body;
    const hashedToken = hashToken(token);

    try {
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({ error: 'Token je neispravan ili je istekao' });
      }

      user.passwordHash = await hashPassword(password);
      user.sessionVersion = (user.sessionVersion || 0) + 1;
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      await user.save();

      // Invalidiraj sve postojeće sesije - zahtijeva ponovno prijavljivanje
      res.json({ message: 'Lozinka uspješno promijenjena. Prijavite se s novom lozinkom.' });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({ error: 'Greška pri promjeni lozinke' });
    }
  }
);

export default router;
