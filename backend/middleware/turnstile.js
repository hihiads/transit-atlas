import fetch from 'node-fetch';

export const verifyTurnstile = action => async (req, res, next) => {
  // Skip u lokalnom razvoju ako je TURNSTILE_SECRET_KEY dummy vrijednost
  if (process.env.NODE_ENV !== 'production' &&
      (!process.env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY.startsWith('1x0000000'))) {
    return next();
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
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: req.ip
      })
    });

    const data = await response.json();
    const allowedHostnames = (process.env.APP_ORIGIN || '').split(',').flatMap(origin => {
      try { return [new URL(origin.trim()).hostname]; } catch { return []; }
    });
    const validContext = process.env.NODE_ENV !== 'production' ||
      (allowedHostnames.includes(data.hostname) && data.action === action);

    if (!response.ok || !data.success || !validContext) {
      return res.status(400).json({ error: 'Turnstile provjera nije uspjela' });
    }

    next();
  } catch (error) {
    console.error('Turnstile verification error:', error.name);
    return res.status(500).json({ error: 'Greška pri provjeri Turnstile tokena' });
  }
};
