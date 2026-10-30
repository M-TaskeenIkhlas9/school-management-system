import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";
import { normalizePhone } from "../../lib/phone.js";
import { pageResult, pageWindow, whereClause } from "../../lib/pagination.js";

const CONSENT_FIELDS = ["consent_whatsapp", "consent_sms", "consent_email"];

/** Normalise a phone or throw a clear 400 (callers pass user input). */
export function phoneOrThrow(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const phone = normalizePhone(raw);
  if (!phone) throw createError(400, `"${raw}" is not a valid phone number`, "INVALID_PHONE");
  return phone;
}

const scopeJoin = (classIds) =>
  classIds
    ? `JOIN student_guardians sgs ON sgs.guardian_id = g.id
       JOIN enrollments es ON es.student_id = sgs.student_id AND es.is_active = 1 AND es.classroom_id IN (?)`
    : "";

export async function list({ q, classIds = null, ...page }) {
  if (classIds && !classIds.length) return pageResult([], 0, page);
  const like = q ? `%${q}%` : null;
  const where = whereClause([["(g.full_name LIKE ? OR g.email LIKE ? OR g.phone LIKE ?)", like]]);
  const params = [...(classIds ? [classIds] : []), ...(like ? [like, like, like] : [])];
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(DISTINCT g.id) AS total FROM guardians g ${scopeJoin(classIds)} ${where.sql}`,
    params
  );
  const { limit, offset } = pageWindow(page);
  const [rows] = await pool.query(
    `SELECT DISTINCT g.*,
            (SELECT GROUP_CONCAT(CONCAT(s.first_name, ' ', s.last_name) ORDER BY s.first_name SEPARATOR ', ')
             FROM student_guardians sg JOIN students s ON s.id = sg.student_id AND s.is_active = 1
             WHERE sg.guardian_id = g.id) AS student_names
     FROM guardians g ${scopeJoin(classIds)} ${where.sql}
     ORDER BY g.full_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return pageResult(rows, total, page);
}

export async function getById(id) {
  const [[guardian]] = await pool.execute("SELECT * FROM guardians WHERE id = ?", [id]);
  if (!guardian) return null;
  const [students] = await pool.execute(
    `SELECT s.id, s.first_name, s.last_name, sg.relationship, sg.is_primary
     FROM student_guardians sg JOIN students s ON s.id = sg.student_id
     WHERE sg.guardian_id = ? AND s.is_active = 1 ORDER BY s.first_name`,
    [id]
  );
  return { ...guardian, students };
}

/** Guardian ids visible to a class-scoped user (for access checks). */
export async function isVisible(guardianId, classIds) {
  if (!classIds) return true;
  if (!classIds.length) return false;
  const [rows] = await pool.query(
    `SELECT 1 FROM student_guardians sg
     JOIN enrollments e ON e.student_id = sg.student_id AND e.is_active = 1
     WHERE sg.guardian_id = ? AND e.classroom_id IN (?) LIMIT 1`,
    [guardianId, classIds]
  );
  return rows.length > 0;
}

function consentChanges(data) {
  const changed = CONSENT_FIELDS.filter((f) => data[f] !== undefined);
  return { fields: changed, values: changed.map((f) => (data[f] ? 1 : 0)) };
}

export async function create(data, conn = pool) {
  const phone = phoneOrThrow(data.phone);
  const consent = consentChanges(data);
  const [res] = await conn.execute(
    `INSERT INTO guardians (full_name, email, phone, preferred_channel, language, notes${consent.fields.map((f) => `, ${f}`).join("")}${consent.fields.length ? ", consent_updated_at" : ""})
     VALUES (?, ?, ?, ?, ?, ?${consent.fields.map(() => ", ?").join("")}${consent.fields.length ? ", NOW()" : ""})`,
    [
      data.full_name,
      data.email || null,
      phone ?? null,
      data.preferred_channel || "email",
      data.language || null,
      data.notes || null,
      ...consent.values,
    ]
  );
  return res.insertId;
}

export async function update(id, data) {
  const sets = [];
  const values = [];
  for (const key of ["full_name", "email", "preferred_channel", "language", "notes"]) {
    if (data[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(data[key] ?? null);
    }
  }
  if (data.phone !== undefined) {
    sets.push("phone = ?");
    values.push(phoneOrThrow(data.phone));
  }
  const consent = consentChanges(data);
  consent.fields.forEach((f, i) => {
    sets.push(`${f} = ?`);
    values.push(consent.values[i]);
  });
  if (consent.fields.length) sets.push("consent_updated_at = NOW()");
  if (sets.length) await pool.execute(`UPDATE guardians SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  return getById(id);
}

export async function link(conn, studentId, guardianId, { relationship = null, isPrimary = false } = {}) {
  if (isPrimary) await conn.execute("UPDATE student_guardians SET is_primary = 0 WHERE student_id = ?", [studentId]);
  await conn.execute(
    `INSERT INTO student_guardians (student_id, guardian_id, relationship, is_primary) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE relationship = COALESCE(VALUES(relationship), relationship), is_primary = VALUES(is_primary)`,
    [studentId, guardianId, relationship, isPrimary ? 1 : 0]
  );
}

export async function unlink(studentId, guardianId) {
  await pool.execute("DELETE FROM student_guardians WHERE student_id = ? AND guardian_id = ?", [studentId, guardianId]);
}
