import jwt from "jsonwebtoken";
import { createError } from "./errorHandler.js";

export default function auth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(createError(401, "Authentication required", "AUTH_REQUIRED"));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(createError(401, "Token expired", "TOKEN_EXPIRED"));
    }
    return next(createError(401, "Invalid token", "INVALID_TOKEN"));
  }
}

/** Restrict a route to users whose JWT role is in `roles`. Use after `auth`. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(createError(403, "You do not have permission to do this", "FORBIDDEN"));
    }
    next();
  };
}
