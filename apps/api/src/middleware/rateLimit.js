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

/** Cap assistant messages per user (each one can cost AI tokens): AGENT_RATE_LIMIT per minute (default 20). */
export const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: Number(process.env.AGENT_RATE_LIMIT) || 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) => `user:${req.user?.id ?? "anon"}`,
  message: limitMessage("You're sending messages too quickly. Please wait a minute."),
});
