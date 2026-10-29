import jwt from "jsonwebtoken";
import pool from "../db/pool.js";
import { createError } from "./errorHandler.js";
import { CLASS_SCOPED_ROLES, permissionsFor } from "../modules/auth/permissions.js";

/**
 * Verify the JWT, then load the user from the database on every request so that a
 * role change or deactivation takes effect immediately (not when the token expires).
 *
 * Sets req.user = { id, username, email, role, teacherId, permissions: Set, classIds }
 * where classIds is null (all classes) or the array of classes a scoped role may access.
 */
export default async function auth(req, _res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(createError(401, "Authentication required", "AUTH_REQUIRED"));
  }

  let payload;
  try {
    payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") return next(createError(401, "Token expired", "TOKEN_EXPIRED"));
    return next(createError(401, "Invalid token", "INVALID_TOKEN"));
  }

  const user = await loadUserContext(payload.id);
  if (!user) return next(createError(401, "Account is disabled or no longer exists", "ACCOUNT_DISABLED"));
  if ((payload.sv ?? 0) !== user.sessionVersion) {
    return next(createError(401, "You were signed out. Please sign in again.", "SESSION_REVOKED"));
  }
  const { sessionVersion: _sv, ...context } = user;
  req.user = context;
  next();
}

/**
 * The same shape as req.user, loaded fresh from the database for an active account (null otherwise).
 * Also used by scheduled work that acts for a person (automations), so it always gets their
 * current role, permissions and classes.
 */
export async function loadUserContext(userId) {
  const [[user]] = await pool.execute(
    "SELECT id, username, email, role, teacher_id, is_active, session_version FROM users WHERE id = ?",
    [userId]
  );
  if (!user || !user.is_active) return null;

  let classIds = null;
  if (CLASS_SCOPED_ROLES.has(user.role)) {
    const [rows] = user.teacher_id
      ? await pool.execute("SELECT classroom_id FROM teacher_classes WHERE teacher_id = ?", [user.teacher_id])
      : [[]];
    classIds = rows.map((r) => r.classroom_id);
  }
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    teacherId: user.teacher_id,
    permissions: new Set(permissionsFor(user.role)),
    classIds,
    sessionVersion: user.session_version,
  };
}
