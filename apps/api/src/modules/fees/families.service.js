/**
 * Family accounts and discounts. A family is a primary guardian and their children, so siblings
 * share one statement and can pay in one go. Discounts: the school's sibling discount (each younger
 * child gets it; the eldest pays in full) plus any standing concession on a student.
 */
import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { school } from "../settings/school.js";

const money = (n) => Math.round(Number(n) * 100) / 100;
const KIND_LABEL = {
  scholarship: "Scholarship",
  staff_child: "Staff child",
  need_based: "Need-based",
  other: "Concession",
};

// ---------- Concessions ----------

export async function listConcessions({ student_id } = {}) {
  const [rows] = await pool.query(
    `SELECT c.*, CONCAT(s.first_name, ' ', s.last_name) AS student_name
     FROM fee_concessions c JOIN students s ON s.id = c.student_id
     WHERE c.is_active = 1 ${student_id ? "AND c.student_id = ?" : ""}
     ORDER BY s.first_name, s.last_name`,
    student_id ? [student_id] : []
  );
  return rows.map((r) => ({ ...r, value: Number(r.value), label: KIND_LABEL[r.kind] }));
}

export async function addConcession({ student_id, kind, type, value, note }, userId) {
  if (type === "percent" && value > 100) {
    throw createError(400, "A percentage can't be more than 100", "VALIDATION_ERROR");
  }
  const [res] = await pool.execute(
    "INSERT INTO fee_concessions (student_id, kind, type, value, note, created_by) VALUES (?, ?, ?, ?, ?, ?)",
    [student_id, kind, type, value, note || null, userId]
  );
  return (await listConcessions({ student_id })).find((c) => c.id === res.insertId);
}

export async function endConcession(id) {
  const [res] = await pool.execute("UPDATE fee_concessions SET is_active = 0 WHERE id = ? AND is_active = 1", [id]);
  if (!res.affectedRows) throw createError(404, "Concession not found", "NOT_FOUND");
}

/**
 * Discount for each student on a bill of `base`. Younger siblings (by date of birth, then by
 * admission) get the sibling discount; concessions add on top; never more than the fee itself.
 * @returns Map(studentId → { discount, note })
 */
export async function discountsFor(studentIds, base) {
  if (!studentIds.length || !(base > 0)) return new Map();
  const out = new Map(studentIds.map((id) => [id, { discount: 0, notes: [] }]));

  const siblingPct = Number(school().sibling_discount) || 0;
  if (siblingPct > 0) {
    // Every child of each family (not only those being billed), so the eldest is found correctly.
    const [families] = await pool.query(
      `SELECT sg.guardian_id, s.id, s.date_of_birth
       FROM student_guardians sg JOIN students s ON s.id = sg.student_id AND s.is_active = 1
       WHERE sg.is_primary = 1 AND sg.guardian_id IN (
         SELECT guardian_id FROM student_guardians WHERE is_primary = 1 AND student_id IN (?))`,
      [studentIds]
    );
    const byFamily = new Map();
    for (const r of families) byFamily.set(r.guardian_id, [...(byFamily.get(r.guardian_id) ?? []), r]);
    for (const kids of byFamily.values()) {
      kids.sort((a, b) => {
        if (a.date_of_birth && b.date_of_birth) return new Date(a.date_of_birth) - new Date(b.date_of_birth);
        if (a.date_of_birth || b.date_of_birth) return a.date_of_birth ? -1 : 1;
        return a.id - b.id;
      });
      for (const k of kids.slice(1)) {
        const entry = out.get(k.id);
        if (!entry) continue;
        entry.discount += (base * siblingPct) / 100;
        entry.notes.push(`Sibling ${siblingPct}%`);
      }
    }
  }

  const [concessions] = await pool.query(
    "SELECT student_id, kind, type, value FROM fee_concessions WHERE is_active = 1 AND student_id IN (?)",
    [studentIds]
  );
  for (const c of concessions) {
    const entry = out.get(c.student_id);
    const value = Number(c.value);
    entry.discount += c.type === "percent" ? (base * value) / 100 : value;
    entry.notes.push(`${KIND_LABEL[c.kind]} ${c.type === "percent" ? `${value}%` : value}`);
  }

  return new Map(
    [...out].map(([id, e]) => [id, { discount: money(Math.min(base, e.discount)), note: e.notes.join(" · ") || null }])
  );
}

// ---------- Families ----------

/** Families (a primary guardian with at least one active child), with what they owe. */
export async function listFamilies({ q } = {}) {
  const like = q ? `%${String(q).trim()}%` : null;
  const [rows] = await pool.query(
    `SELECT g.id, g.full_name, g.phone, g.email,
            COUNT(DISTINCT s.id) AS children,
            GROUP_CONCAT(DISTINCT CONCAT(s.first_name, ' ', s.last_name) ORDER BY s.first_name SEPARATOR ', ') AS child_names,
            COALESCE((SELECT SUM(f.amount_due - f.amount_paid) FROM fee_ledgers f
                      JOIN student_guardians x ON x.student_id = f.student_id AND x.is_primary = 1
                      WHERE x.guardian_id = g.id AND f.amount_paid < f.amount_due), 0) AS outstanding
     FROM guardians g
     JOIN student_guardians sg ON sg.guardian_id = g.id AND sg.is_primary = 1
     JOIN students s ON s.id = sg.student_id AND s.is_active = 1
     ${like ? "WHERE g.full_name LIKE ? OR g.phone LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?" : ""}
     GROUP BY g.id, g.full_name, g.phone, g.email
     ORDER BY outstanding DESC, g.full_name
     LIMIT 50`,
    like ? [like, like.replace(/\s+/g, ""), like] : []
  );
  return rows.map((r) => ({ ...r, children: Number(r.children), outstanding: money(r.outstanding) }));
}

/** A family's statement: each child, their unpaid fees, and recent payments. */
export async function statement(guardianId) {
  const [[guardian]] = await pool.query("SELECT id, full_name, phone, email FROM guardians WHERE id = ?", [guardianId]);
  if (!guardian) throw createError(404, "Family not found", "NOT_FOUND");
  const [children] = await pool.query(
    `SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS name, s.roll_number, c.name AS class_name, c.section
     FROM student_guardians sg
     JOIN students s ON s.id = sg.student_id AND s.is_active = 1
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     WHERE sg.guardian_id = ? AND sg.is_primary = 1
     ORDER BY s.date_of_birth IS NULL, s.date_of_birth, s.id`,
    [guardianId]
  );
  if (!children.length) throw createError(404, "Family not found", "NOT_FOUND");
  const ids = children.map((c) => c.id);
  const [fees] = await pool.query(
    `SELECT id, student_id, month, due_date, amount_due, amount_paid, discount, discount_note, status
     FROM fee_ledgers WHERE student_id IN (?) AND amount_paid < amount_due ORDER BY due_date, id`,
    [ids]
  );
  const [payments] = await pool.query(
    `SELECT p.id, p.fee_id, p.amount, p.paid_on, p.method, p.note, f.student_id, f.month
     FROM fee_payments p JOIN fee_ledgers f ON f.id = p.fee_id
     WHERE f.student_id IN (?) ORDER BY p.id DESC LIMIT 20`,
    [ids]
  );
  const unpaid = fees.map((f) => ({
    ...f,
    amount_due: Number(f.amount_due),
    amount_paid: Number(f.amount_paid),
    discount: Number(f.discount),
    remaining: money(Number(f.amount_due) - Number(f.amount_paid)),
  }));
  return {
    guardian,
    children: children.map((c) => {
      const mine = unpaid.filter((f) => f.student_id === c.id);
      return { ...c, unpaid: mine, outstanding: money(mine.reduce((n, f) => n + f.remaining, 0)) };
    }),
    outstanding: money(unpaid.reduce((n, f) => n + f.remaining, 0)),
    payments: payments.map((p) => ({ ...p, amount: Number(p.amount) })),
  };
}

/**
 * One payment for the whole family, spread over the children's unpaid fees, oldest due first.
 * Each fee it touches gets its own payment row, so every child's receipt history stays complete.
 */
export async function payFamily(guardianId, { amount, method = "cash", paid_on, note }, userId) {
  const { children, outstanding } = await statement(guardianId);
  const total = money(amount);
  if (outstanding <= 0) throw createError(400, "This family has nothing left to pay", "ALREADY_PAID");
  if (total > outstanding) {
    throw createError(400, `The family owes ${outstanding}; that is the most you can receive`, "PAYMENT_EXCEEDS_FEE");
  }
  const day = paid_on || schoolToday();
  // Oldest due first; within the same due date, eldest child first (the statement's order).
  const fees = children
    .flatMap((c, order) => c.unpaid.map((f) => ({ ...f, child: c.name, order })))
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date) || a.order - b.order || a.id - b.id);

  const conn = await pool.getConnection();
  const applied = [];
  try {
    await conn.beginTransaction();
    let left = total;
    for (const fee of fees) {
      if (left <= 0) break;
      const [[locked]] = await conn.execute("SELECT amount_due, amount_paid FROM fee_ledgers WHERE id = ? FOR UPDATE", [
        fee.id,
      ]);
      const remaining = money(Number(locked.amount_due) - Number(locked.amount_paid));
      if (remaining <= 0) continue;
      const pay = money(Math.min(left, remaining));
      const paid = money(Number(locked.amount_paid) + pay);
      const status = paid >= Number(locked.amount_due) ? "paid" : "partial";
      const [res] = await conn.execute(
        "INSERT INTO fee_payments (fee_id, amount, paid_on, method, note, received_by) VALUES (?, ?, ?, ?, ?, ?)",
        [fee.id, pay, day, method, note || "Family payment", userId]
      );
      await conn.execute("UPDATE fee_ledgers SET amount_paid = ?, status = ?, paid_date = ? WHERE id = ?", [
        paid,
        status,
        status === "paid" ? day : null,
        fee.id,
      ]);
      applied.push({
        payment_id: res.insertId,
        fee_id: fee.id,
        child: fee.child,
        month: fee.month,
        amount: pay,
        status,
      });
      left = money(left - pay);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return {
    guardian_id: guardianId,
    amount: total,
    paid_on: day,
    method,
    receipt_no: applied[0]?.payment_id ?? null,
    applied,
    outstanding_after: money(outstanding - total),
  };
}
