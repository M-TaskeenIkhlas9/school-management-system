export default function errorHandler(err, _req, res, _next) {
  const status = err.status || 500;
  const code = err.code || "INTERNAL_ERROR";
  const message = err.message || "Something went wrong";

  if (process.env.NODE_ENV !== "test") {
    console.error(`[${code}] ${message}`, err.details || "");
  }

  res.status(status).json({
    error: message,
    code,
    ...(err.details && { details: err.details }),
  });
}

export function createError(status, message, code, details) {
  const err = new Error(message);
  err.status = status;
  err.code = code || "ERROR";
  if (details) err.details = details;
  return err;
}
