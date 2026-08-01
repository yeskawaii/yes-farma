import rateLimit from 'express-rate-limit';

export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Intenta más tarde.' } },
  standardHeaders: true,
  legacyHeaders: false,
});
