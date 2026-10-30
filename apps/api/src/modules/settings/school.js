/**
 * The school's details (name, address, phone, bank account for challans, late fee fine). The
 * principal edits them on the Settings page; anything left empty falls back to the server settings.
 * Kept in memory so messages and prompts can read them without a query; refreshed on change.
 */
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";

let saved = {};

const fromEnv = () => ({
  name: process.env.SCHOOL_NAME || "",
  address: process.env.SCHOOL_ADDRESS || "",
  phone: process.env.SCHOOL_PHONE || "",
  bank_details: process.env.SCHOOL_BANK_DETAILS || "",
  late_fine: Number(process.env.FEE_LATE_FINE) || 0,
  sibling_discount: Number(process.env.SIBLING_DISCOUNT) || 0,
});

/** Current details: saved values first, server settings for anything not set. */
export function school() {
  const env = fromEnv();
  const pick = (key) => (saved[key] === null || saved[key] === undefined || saved[key] === "" ? env[key] : saved[key]);
  return {
    name: pick("name"),
    address: pick("address"),
    phone: pick("phone"),
    bank_details: pick("bank_details"),
    late_fine: Number(pick("late_fine")) || 0,
    sibling_discount: Number(pick("sibling_discount")) || 0,
    currency: process.env.CURRENCY || "USD",
    timezone: process.env.SCHOOL_TIMEZONE || "Asia/Karachi",
  };
}

/** Reload the saved details from the database (at start-up and after a change). */
export async function refreshSchool() {
  try {
    const [[row]] = await pool.query(
      "SELECT name, address, phone, bank_details, late_fine, sibling_discount FROM school_settings WHERE id = 1"
    );
    saved = row ?? {};
  } catch (err) {
    logger.warn({ err: err.message }, "Could not load school settings; using server settings");
  }
  return school();
}

/** Save what the principal entered (empty text clears a value back to the server setting). */
export async function updateSchool(changes, userId) {
  const fields = ["name", "address", "phone", "bank_details", "late_fine", "sibling_discount"].filter(
    (k) => changes[k] !== undefined
  );
  if (fields.length) {
    const value = (k) =>
      ["late_fine", "sibling_discount"].includes(k) ? Number(changes[k]) || 0 : String(changes[k]).trim() || null;
    await pool.query(
      `INSERT INTO school_settings (id, ${fields.join(", ")}, updated_by) VALUES (1, ${fields.map(() => "?").join(", ")}, ?)
       ON DUPLICATE KEY UPDATE ${fields.map((k) => `${k} = VALUES(${k})`).join(", ")}, updated_by = VALUES(updated_by)`,
      [...fields.map(value), userId]
    );
  }
  return refreshSchool();
}
