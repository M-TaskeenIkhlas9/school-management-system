import rateLimit from "express-rate-limit";

const limitMessage = (message) => ({ error: message, code: "RATE_LIMITED" });

/** Slow down password guessing: LOGIN_RATE_LIMIT attempts per 15 minutes per IP (default 10). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_LIMIT) || 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed logins count
  message: limitMessage("Too many login attempts. Please wait 15 minutes and try again."),
});
