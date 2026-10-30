/**
 * Linking a staff member's WhatsApp number to their account. The web app shows a one-time code
 * (valid 15 minutes); sending "LINK <code>" from the phone to the school's number proves the person
 * holds both the account and the phone. The link ends when the account's sessions are revoked.
 */
import { createHash, randomInt } from "node:crypto";
import pool from "../../db/pool.js";
import { audit } from "../../lib/audit.js";
import { loadUserContext } from "../../middleware/auth.js";
import { getChannel } from "../../messaging/channels/index.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const CODE_LENGTH = 8;
const CODE_MINUTES = 15;
// Failed LINK attempts allowed per phone per hour, so codes can't be guessed.
const MAX_FAILED = 5;

const hash = (code) => createHash("sha256").update(code).digest("hex");
const display = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** "link 7k3p-q9xa" → "7K3PQ9XA", or null when the text isn't a link request. */
export function parseLinkCode(text) {
  const m = String(text ?? "").match(/^\s*link\s*[:#-]?\s*([a-z0-9]{4})[\s-]?([a-z0-9]{4})\s*$/i);
  return m ? (m[1] + m[2]).toUpperCase() : null;
}

/** Whether the bot can work: WhatsApp is on and Meta's webhooks are signed. */
export const botAvailable = () => getChannel("whatsapp").enabled() && Boolean(process.env.WHATSAPP_APP_SECRET);

/** The school's WhatsApp number in digits (for wa.me links), or null. */
function botNumber() {
  const digits = String(process.env.WHATSAPP_BOT_NUMBER ?? "").replace(/\D/g, "");
  return digits || null;
}

export async function linkStatus(userId) {
  const [[row]] = await pool.execute(
    `SELECT whatsapp_phone, whatsapp_linked_at, whatsapp_sv = session_version AS valid FROM users WHERE id = ?`,
    [userId]
  );
  const linked = Boolean(row?.whatsapp_phone && row.valid);
  return {
    linked,
    phone: linked ? row.whatsapp_phone : null,
    linked_at: linked ? row.whatsapp_linked_at : null,
    bot_number: botNumber() ? `+${botNumber()}` : null,
    available: botAvailable(),
  };
}

/** A fresh code for this user (any earlier one stops working). */
export async function newLinkCode(userId) {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  await pool.execute(
    `REPLACE INTO whatsapp_link_codes (user_id, code_hash, expires_at)
     VALUES (?, ?, NOW() + INTERVAL ${CODE_MINUTES} MINUTE)`,
    [userId, hash(code)]
  );
  const text = `LINK ${code}`;
  return {
    code: display(code),
    message: text,
    minutes: CODE_MINUTES,
    bot_number: botNumber() ? `+${botNumber()}` : null,
    url: botNumber() ? `https://wa.me/${botNumber()}?text=${encodeURIComponent(text)}` : null,
  };
}

/** Too many wrong codes from this phone in the last hour. */
export async function tooManyAttempts(phone) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM staff_whatsapp_messages
     WHERE phone = ? AND direction = 'in' AND status = 'link_failed' AND created_at > NOW() - INTERVAL 1 HOUR`,
    [phone]
  );
  return Number(row.n) >= MAX_FAILED;
}

/** Link `phone` to the account whose code this is. Returns the user context, or null for a wrong code. */
export async function linkByCode(phone, code) {
  const conn = await pool.getConnection();
  let userId;
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute(
      "SELECT user_id FROM whatsapp_link_codes WHERE code_hash = ? AND expires_at > NOW() FOR UPDATE",
      [hash(code)]
    );
    if (!row) {
      await conn.rollback();
      return null;
    }
    userId = row.user_id;
    // One number belongs to one account: it moves if someone else had it.
    await conn.execute("UPDATE users SET whatsapp_phone = NULL WHERE whatsapp_phone = ? AND id <> ?", [phone, userId]);
    await conn.execute(
      `UPDATE users SET whatsapp_phone = ?, whatsapp_sv = session_version, whatsapp_linked_at = NOW()
       WHERE id = ? AND is_active = 1`,
      [phone, userId]
    );
    await conn.execute("DELETE FROM whatsapp_link_codes WHERE user_id = ?", [userId]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const user = await loadUserContext(userId);
  if (user) await audit({ user }, "whatsapp.link", { entityType: "user", entityId: userId, details: { phone } });
  return user;
}

export async function unlink(req) {
  await pool.execute(
    "UPDATE users SET whatsapp_phone = NULL, whatsapp_sv = NULL, whatsapp_linked_at = NULL WHERE id = ?",
    [req.user.id]
  );
  await pool.execute("DELETE FROM whatsapp_link_codes WHERE user_id = ?", [req.user.id]);
  await audit(req, "whatsapp.unlink", { entityType: "user", entityId: req.user.id });
}

/** The active account this number is linked to (null if none, deactivated, or signed out since). */
export async function linkedUser(phone) {
  const [[row]] = await pool.execute(
    "SELECT id FROM users WHERE whatsapp_phone = ? AND is_active = 1 AND whatsapp_sv = session_version",
    [phone]
  );
  return row ? loadUserContext(row.id) : null;
}
