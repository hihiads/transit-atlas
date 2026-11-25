import rateLimit from 'express-rate-limit';
import { createHash } from 'node:crypto';

export const asyncRoute = handler => (req, res, next) => {
  Promise.resolve().then(() => handler(req, res, next)).catch(next);
};

export function emailActionLimiter({ maxByIp, maxByEmail, skipSuccessfulRequests = false }) {
  const options = {
    windowMs: 15 * 60 * 1000,
    message: { error: 'Previše zahtjeva. Pokušajte ponovno kasnije.' },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests
  };
  return [
    rateLimit({ ...options, limit: maxByIp }),
    rateLimit({
      ...options,
      limit: maxByEmail,
      skip: req => typeof req.body?.email !== 'string',
      keyGenerator: req => {
        return createHash('sha256').update(req.body.email.trim().toLowerCase()).digest('hex');
      }
    })
  ];
}

// Opći rate limiter za API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  max: 600, // vehicle polling plus stops, schedules, and route requests
  message: { error: 'Previše zahtjeva. Pokušajte ponovno kasnije.' },
  standardHeaders: true,
  legacyHeaders: false,
  // trust proxy postavljen na serveru
});

export const vehiclesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  message: { error: 'Previše zahtjeva. Pokušajte ponovno kasnije.' },
  standardHeaders: false,
  legacyHeaders: false,
});

export const oauthChallengeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { error: 'Previše pokušaja prijave. Pokušajte ponovno kasnije.' },
  standardHeaders: true,
  legacyHeaders: false
});

export const oauthCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Previše pokušaja Google prijave. Pokušajte ponovno kasnije.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiter za skupe operacije (GTFS download, shapes)
export const heavyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuta
  max: 10,
  message: { error: 'Previše zahtjeva. Pričekajte trenutak.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Previše pokušaja. Pokušajte ponovno za 15 minuta.' },
  standardHeaders: true,
  legacyHeaders: false
});
