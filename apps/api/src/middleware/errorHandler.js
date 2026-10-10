import logger from "../lib/logger.js";

/**
 * Final error handler. Known errors (createError) are returned as-is, whatever their status.
 * Unexpected errors (DB failures, bugs) are logged in full but the client
 * only gets a generic message outside development, so internals (SQL, table names) never leak.
 */
export default function errorHandler(err, req, res, _next) {
  // Malformed JSON bodies from express.json()
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Request body is not valid JSON", code: "INVALID_JSON" });
  }

  const status = err.status || err.statusCode || 500;
  // Errors raised on purpose with createError() are safe to show, even 5xx (e.g. 503 "not configured").
  const expected = status < 500 || err.expose === true;

  if (expected) {
    req.log?.debug({ code: err.code, details: err.details }, err.message);
  } else {
    (req.log || logger).error({ err }, "Unhandled error");
  }

  const exposeInternal = process.env.NODE_ENV === "development";
  res.status(status).json({
    error: expected || exposeInternal ? err.message : "Something went wrong. Please try again.",
    code: expected ? err.code || "ERROR" : "INTERNAL_ERROR",
    ...(expected && err.details && { details: err.details }),
  });
}

export function createError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code || "ERROR";
  err.expose = true;
  if (details) err.details = details;
  return err;
}
