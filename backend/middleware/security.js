import rateLimit from 'express-rate-limit';

// Opći rate limiter za API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  max: 600, // vehicle polling plus stops, schedules, and route requests
  message: { error: 'Previše zahtjeva. Pokušajte ponovno kasnije.' },
  standardHeaders: true,
  legacyHeaders: false,
  // trust proxy postavljen na serveru
});

// Strožiji rate limiter za autentifikaciju
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { error: 'Previše pokušaja. Pokušajte ponovno za 15 minuta.' },
  standardHeaders: true,
  legacyHeaders: false,
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
