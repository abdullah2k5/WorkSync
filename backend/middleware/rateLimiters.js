const { rateLimit } = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

const passwordLimiter = rateLimit({
  windowMs: Number(process.env.PASSWORD_RATE_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.PASSWORD_RATE_LIMIT) || 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, message: 'Too many password attempts. Please try again later.' },
});

module.exports = { loginLimiter, passwordLimiter };
