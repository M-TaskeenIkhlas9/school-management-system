import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";
import { createError } from "../../middleware/errorHandler.js";

const SALT_ROUNDS = 10;

export async function register(username, email, password) {
  const [existing] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length > 0) {
    throw createError(409, "Email already registered", "DUPLICATE_EMAIL");
  }
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const [result] = await pool.execute(
    "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, 'principal')",
    [username, email, hash]
  );
  const [rows] = await pool.execute("SELECT id, username, email, role, created_at FROM users WHERE id = ?", [
    result.insertId,
  ]);
  return rows[0];
}

export async function login(email, password) {
  const [rows] = await pool.execute("SELECT * FROM users WHERE email = ? AND is_active = 1", [email]);
  if (rows.length === 0) {
    throw createError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  const user = rows[0];
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw createError(401, "Invalid email or password", "INVALID_CREDENTIALS");
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "24h",
  });
  return {
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role },
  };
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
  await register("Principal", email, password);
  logger.info(`Default principal created: ${email}`);
}
