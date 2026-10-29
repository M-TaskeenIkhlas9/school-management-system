import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";
import { createError } from "../../middleware/errorHandler.js";
import { CLASS_SCOPED_ROLES, permissionsFor } from "./permissions.js";

const SALT_ROUNDS = 10;
export const hashPassword = (password) => bcrypt.hash(password, SALT_ROUNDS);

const PUBLIC_USER_COLUMNS = "id, username, email, role, teacher_id, is_active, last_login_at, created_at";

export async function getUser(id) {
  const [rows] = await pool.execute(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] || null;
}

export async function createUser({ username, email, password, role, teacher_id = null }) {
  const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) throw createError(409, "Email already registered", "DUPLICATE_EMAIL");
  const [result] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, role, teacher_id) VALUES (?, ?, ?, ?, ?)",
    [username, email, await hashPassword(password), role, teacher_id]
  );
  return getUser(result.insertId);
}

/** Public facts about the school the web app shows (name on the sign-in page, currency for amounts). */
export function schoolInfo() {
  return {
    name: process.env.SCHOOL_NAME || "School",
    currency: process.env.CURRENCY || "USD",
    timezone: process.env.SCHOOL_TIMEZONE || "Asia/Karachi",
  };
}

/** School details for signed-in staff: what fee challans and report cards print. */
export function schoolDetails() {
  return {
    ...schoolInfo(),
    address: process.env.SCHOOL_ADDRESS || "",
    phone: process.env.SCHOOL_PHONE || "",
    bank_details: process.env.SCHOOL_BANK_DETAILS || "",
    late_fine: Number(process.env.FEE_LATE_FINE) || 0,
  };
}

/** What the web app needs to know about the signed-in user. */
export async function describeSession(userRow) {
  let classIds = null;
  if (CLASS_SCOPED_ROLES.has(userRow.role)) {
    const [rows] = userRow.teacher_id
      ? await pool.execute("SELECT classroom_id FROM teacher_classes WHERE teacher_id = ?", [userRow.teacher_id])
      : [[]];
    classIds = rows.map((r) => r.classroom_id);
  }
  return {
    user: { id: userRow.id, username: userRow.username, email: userRow.email, role: userRow.role },
    permissions: permissionsFor(userRow.role),
    classIds,
    school: schoolDetails(),
  };
}

export async function login(email, password) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw createError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  return { token: issueToken(user), ...(await describeSession(user)) };
}

/** Tokens carry the user's session version; bumping it (see revokeSessions) signs them out everywhere. */
export const issueToken = (user) =>
  jwt.sign({ id: user.id, sv: user.session_version ?? 0 }, process.env.JWT_SECRET, { expiresIn: "24h" });

/** End every session of this user (their next request gets 401 SESSION_REVOKED). */
export async function revokeSessions(userId, conn = pool) {
  await conn.execute("UPDATE users SET session_version = session_version + 1 WHERE id = ?", [userId]);
}

/** A signed-in user changes their own password; other devices are signed out, this one gets a new token. */
export async function changeOwnPassword(userId, currentPassword, newPassword) {
  const [[user]] = await pool.execute("SELECT * FROM users WHERE id = ? AND is_active = 1", [userId]);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw createError(400, "Your current password is not correct", "WRONG_PASSWORD");
  }
  if (currentPassword === newPassword) {
    throw createError(400, "Choose a password different from the current one", "SAME_PASSWORD");
  }
  await pool.execute("UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?", [
    await hashPassword(newPassword),
    userId,
  ]);
  return { token: issueToken({ id: userId, session_version: user.session_version + 1 }) };
}

export async function ensureDefaultPrincipal() {
  const [rows] = await pool.execute("SELECT id FROM users LIMIT 1");
  if (rows.length > 0) return;

  const email = process.env.DEFAULT_PRINCIPAL_EMAIL || "admin@school.com";
  let password = process.env.DEFAULT_PRINCIPAL_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DEFAULT_PRINCIPAL_PASSWORD must be set to create the first principal in production");
    }
    password = "admin123";
    logger.warn("DEFAULT_PRINCIPAL_PASSWORD not set — using dev password 'admin123'. Do not use in production.");
  }
  await createUser({ username: "Principal", email, password, role: "principal" });
  logger.info(`Default principal created: ${email}`);
}
