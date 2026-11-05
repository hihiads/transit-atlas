import fetch from 'node-fetch';

export async function verifyTurnstile(req, res, next) {
  // Skip u lokalnom razvoju ako je TURNSTILE_SECRET_KEY dummy vrijednost
  if (process.env.NODE_ENV !== 'production' &&
      process.env.TURNSTILE_SECRET_KEY?.startsWith('1x0000000')) {
    return next();
  }

  const token = req.body.turnstileToken;

  if (!token) {
    return res.status(400).json({ error: 'Turnstile token nedostaje' });
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: req.ip
      })
    });

    const data = await response.json();

    if (!data.success) {
      return res.status(400).json({ error: 'Turnstile provjera nije uspjela' });
    }

    next();
  } catch (error) {
    console.error('Turnstile verification error:', error);
    return res.status(500).json({ error: 'Greška pri provjeri Turnstile tokena' });
  }
}
