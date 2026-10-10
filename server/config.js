import "dotenv/config";

const PLACEHOLDER_SECRET = "change-this-to-a-random-secret-key-in-production";

/**
 * Validate required environment at startup so misconfiguration fails fast
 * instead of surfacing later as a confusing runtime error.
 */
export function assertConfig() {
  const problems = [];
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    problems.push("JWT_SECRET is missing");
  } else if (secret === PLACEHOLDER_SECRET) {
    problems.push("JWT_SECRET is still the placeholder from .env.example");
  } else if (secret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters");
  }

  if (problems.length) {
    throw new Error(
      `Invalid configuration:\n  - ${problems.join("\n  - ")}\n` +
        `Generate a secret with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
    );
  }
}

/** Calendar date (YYYY-MM-DD) in the school's timezone, not UTC. */
export function schoolToday() {
  const timeZone = process.env.SCHOOL_TIMEZONE || "Asia/Karachi";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}
