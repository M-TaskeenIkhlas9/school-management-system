/**
 * Parents/guardians become their own records, linked to one or more students, with
 * E.164 phone numbers and per-channel consent (needed for WhatsApp/SMS later).
 * Existing students.guardian_* data is copied over — de-duplicated so siblings share
 * one guardian — and then the old columns are dropped.
 */
import { normalizePhone } from "../../lib/phone.js";

const normEmail = (email) => (email ? String(email).trim().toLowerCase() : null);

/**
 * Pure planning step (unit-tested): turn legacy student rows into guardians + links.
 * A guardian is identified by email, else by normalised phone, else one per student.
 */
export function planGuardians(students) {
  const guardians = [];
  const byKey = new Map();
  const links = [];

  for (const s of students) {
    const name = s.guardian_name && String(s.guardian_name).trim();
    const email = normEmail(s.guardian_email);
    const rawPhone = s.guardian_phone && String(s.guardian_phone).trim();
    if (!name && !email && !rawPhone) continue;

    const phone = normalizePhone(rawPhone);
    const key = email ? `e:${email}` : phone ? `p:${phone}` : `s:${s.id}`;
    let index = byKey.get(key);
    if (index === undefined) {
      index = guardians.length;
      byKey.set(key, index);
      guardians.push({
        full_name: name || `Guardian of ${s.first_name} ${s.last_name}`.trim(),
        email,
        phone,
        // Keep anything we could not parse so nothing is lost.
        notes: rawPhone && !phone ? `Unrecognised phone from old record: ${rawPhone}` : null,
        preferred_channel: email ? "email" : phone ? "sms" : "email",
        // Existing email contact continues; WhatsApp/SMS need explicit opt-in.
        consent_email: email ? 1 : 0,
      });
    } else {
      const g = guardians[index];
      if (!g.phone && phone) g.phone = phone;
      if (!g.email && email) g.email = email;
    }
    links.push({ student_id: s.id, guardianIndex: index });
  }
  return { guardians, links };
}

export async function up(conn, { log = () => {} } = {}) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS guardians (
      id INT AUTO_INCREMENT PRIMARY KEY,
      full_name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(20) NULL COMMENT 'E.164, e.g. +923001234567',
      preferred_channel ENUM('whatsapp','sms','email') NOT NULL DEFAULT 'email',
      consent_whatsapp TINYINT(1) NOT NULL DEFAULT 0,
      consent_sms TINYINT(1) NOT NULL DEFAULT 0,
      consent_email TINYINT(1) NOT NULL DEFAULT 0,
      consent_updated_at DATETIME NULL,
      notes TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_guardian_email (email),
      INDEX idx_guardian_phone (phone)
    ) ENGINE=InnoDB`);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS student_guardians (
      student_id INT NOT NULL,
      guardian_id INT NOT NULL,
      relationship VARCHAR(50) NULL,
      is_primary TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (student_id, guardian_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
      FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE CASCADE,
      INDEX idx_sg_guardian (guardian_id)
    ) ENGINE=InnoDB`);

  const [students] = await conn.query(
    "SELECT id, first_name, last_name, guardian_name, guardian_email, guardian_phone FROM students"
  );
  const { guardians, links } = planGuardians(students);
  const ids = [];
  for (const g of guardians) {
    const [res] = await conn.query(
      `INSERT INTO guardians (full_name, email, phone, preferred_channel, consent_email, consent_updated_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        g.full_name,
        g.email,
        g.phone,
        g.preferred_channel,
        g.consent_email,
        g.consent_email ? new Date() : null,
        g.notes,
      ]
    );
    ids.push(res.insertId);
  }
  for (const link of links) {
    await conn.query("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
      link.student_id,
      ids[link.guardianIndex],
    ]);
  }
  log(`[migrate] guardians: ${guardians.length} created, ${links.length} student links`);

  await conn.query(
    "ALTER TABLE students DROP COLUMN guardian_name, DROP COLUMN guardian_phone, DROP COLUMN guardian_email"
  );
}
