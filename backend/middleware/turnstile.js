import { getAllowedOrigins, isNativeAppOrigin } from '../config/origins.js';

export const verifyTurnstile = action => async (req, res, next) => {
  const production = process.env.NODE_ENV === 'production';
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret || /^[123]x0{8}/.test(secret)) {
    if (!production) return next();
    return res.status(503).json({ error: 'Sigurnosna provjera trenutačno nije dostupna.' });
  }

  const token = req.body?.turnstileToken;

  if (typeof token !== 'string' || !token || token.length > 2048) {
    return res.status(400).json({ error: 'Turnstile token nedostaje' });
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        response: token,
        remoteip: req.ip
      })
    });

    const data = await response.json();
    const allowedHostnames = [...getAllowedOrigins()]
      .filter(origin => origin.startsWith('https://') && !isNativeAppOrigin(origin))
      .map(origin => new URL(origin).hostname);
    if (!response.ok || data.success !== true || data.action !== action ||
        (production && !allowedHostnames.includes(data.hostname))) {
      return res.status(400).json({ error: 'Turnstile provjera nije uspjela' });
    }

    next();
  } catch (error) {
    console.error('Turnstile verification error:', error.name);
    return res.status(500).json({ error: 'Greška pri provjeri Turnstile tokena' });
  }
};
