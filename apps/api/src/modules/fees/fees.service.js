import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { pageResult, pageWindow, whereClause } from "../../lib/pagination.js";
import { discountsFor } from "./families.service.js";
import { school } from "../settings/school.js";
import { feeReference } from "../payments/reference.js";

/** One page of fee records (latest due date first) with student names. */
export async function list({ student_id, status, ...page }) {
  const where = whereClause([
    ["fl.student_id = ?", student_id],
    ["fl.status = ?", status],
  ]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM fee_ledgers fl ${where.sql}`, where.params);
  const { limit, offset } = pageWindow(page);
  const [rows] = await pool.query(
    `SELECT fl.*, CONCAT(s.first_name, ' ', s.last_name) AS student_name
     FROM fee_ledgers fl JOIN students s ON s.id = fl.student_id
     ${where.sql}
     ORDER BY fl.due_date DESC, fl.id DESC
     LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  return pageResult(rows.map(addRemaining), total, page);
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM fee_ledgers WHERE id = ?", [id]);
  return rows[0] ? addRemaining(rows[0]) : null;
}

export async function create({ student_id, month, due_date, amount_due, amount_paid, status, paid_date }) {
  const paid = Number(amount_paid) || 0;
  if (paid > Number(amount_due)) {
    throw createError(400, "Payment cannot exceed total fee amount", "PAYMENT_EXCEEDS_FEE");
  }
  const autoStatus = paid >= Number(amount_due) ? "paid" : paid > 0 ? "partial" : status || "pending";
  const [result] = await pool.execute(
    "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, amount_paid, status, paid_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [student_id, month || null, due_date, amount_due, paid, autoStatus, paid_date || null]
  );
  return await getById(result.insertId);
}

export async function update(id, data) {
  const existing = await getById(id);
  if (!existing) return null;

  // Recompute status whenever either side of the balance changes.
  if (data.amount_paid !== undefined || data.amount_due !== undefined) {
    const newPaid = data.amount_paid !== undefined ? Number(data.amount_paid) : Number(existing.amount_paid);
    const totalDue = data.amount_due !== undefined ? Number(data.amount_due) : Number(existing.amount_due);
    if (newPaid > totalDue) {
      throw createError(400, "Payment cannot exceed total fee amount", "PAYMENT_EXCEEDS_FEE");
    }
    if (!data.status) {
      data.status = newPaid >= totalDue ? "paid" : newPaid > 0 ? "partial" : "pending";
    }
    if (data.status === "paid" && !data.paid_date) {
      data.paid_date = schoolToday();
    }
  }

  const fields = [];
  const values = [];
  for (const key of ["month", "due_date", "amount_due", "amount_paid", "status", "paid_date"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return existing;
  values.push(id);
  await pool.execute(`UPDATE fee_ledgers SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function getDefaulters() {
  const [rows] = await pool.execute(
    `SELECT fl.*, s.first_name, s.last_name,
            DATEDIFF(?, fl.due_date) as days_overdue
     FROM fee_ledgers fl
     JOIN students s ON s.id = fl.student_id
     WHERE fl.status != 'paid' AND fl.due_date < ? AND s.is_active = 1
     ORDER BY days_overdue DESC`,
    [schoolToday(), schoolToday()]
  );
  return rows.map((r) => {
    const monthsOverdue = Math.ceil(r.days_overdue / 30);
    let risk;
    if (monthsOverdue >= 2) risk = "high";
    else if (monthsOverdue >= 1) risk = "medium";
    else risk = "low";
    return {
      ...addRemaining(r),
      student_name: `${r.first_name} ${r.last_name}`.trim(),
      days_overdue: r.days_overdue,
      risk,
    };
  });
}

function addRemaining(fee) {
  return {
    ...fee,
    remaining_amount: Number((Number(fee.amount_due) - Number(fee.amount_paid)).toFixed(2)),
  };
}

/** Payments recorded against one fee (newest first), with who received them. */
export async function payments(feeId) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.amount, p.late_fine, p.paid_on, p.method, p.note, p.reference, p.created_at,
            u.username AS received_by
     FROM fee_payments p LEFT JOIN users u ON u.id = p.received_by
     WHERE p.fee_id = ? ORDER BY p.id DESC`,
    [feeId]
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount), late_fine: Number(r.late_fine) }));
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/**
 * Apply a payment to a fee inside the caller's transaction (the fee row is locked first). Paying
 * more than what is left is refused; with `allowFine`, a payment made after the due date may also
 * carry the late fine on top of the full balance (it is kept apart from the fee in late_fine).
 */
export async function applyPayment(conn, feeId, payment, userId, { allowFine = false } = {}) {
  const { amount, paid_on, method = "cash", note, reference = null } = payment;
  const [[fee]] = await conn.execute("SELECT * FROM fee_ledgers WHERE id = ? FOR UPDATE", [feeId]);
  if (!fee) throw createError(404, "Fee record not found", "NOT_FOUND");
  const due = Number(fee.amount_due);
  const paidBefore = Number(fee.amount_paid);
  const value = round2(amount);
  const left = round2(due - paidBefore);
  if (left <= 0) throw createError(400, "This fee is already fully paid", "ALREADY_PAID");
  const day = paid_on || schoolToday();
  const fine = value > left ? round2(value - left) : 0;
  const fineAllowed = allowFine && day > dateOnly(fee.due_date) && fine <= school().late_fine;
  if (fine > 0 && !fineAllowed) {
    throw createError(400, `Only ${left} is left to pay on this fee`, "PAYMENT_EXCEEDS_FEE");
  }
  const feePart = round2(value - fine);
  const [res] = await conn.execute(
    `INSERT INTO fee_payments (fee_id, amount, late_fine, paid_on, method, note, reference, received_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [feeId, feePart, fine, day, method, note || null, reference, userId ?? null]
  );
  const paid = round2(paidBefore + feePart);
  const status = paid >= due ? "paid" : "partial";
  await conn.execute("UPDATE fee_ledgers SET amount_paid = ?, status = ?, paid_date = ? WHERE id = ?", [
    paid,
    status,
    status === "paid" ? day : fee.paid_date,
    feeId,
  ]);
  return { payment_id: res.insertId, amount: feePart, late_fine: fine, paid_on: day, method };
}

/**
 * Record a payment (full or an instalment). The fee's paid amount and status follow; paying more
 * than what is left is refused. Returns the fee and the payment (the receipt).
 */
export async function recordPayment(feeId, payment, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const receipt = await applyPayment(conn, feeId, payment, userId);
    await conn.commit();
    return { fee: await getById(feeId), ...receipt };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Bill a month's fee to every student in a class (or every class). Students already billed for
 * that month are skipped, so running it twice never double-charges.
 */
export async function generateMonth({ month, due_date, amount, classroom_id = null }) {
  const [students] = await pool.query(
    `SELECT DISTINCT s.id FROM students s
     JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     WHERE s.is_active = 1 ${classroom_id ? "AND e.classroom_id = ?" : ""}`,
    classroom_id ? [classroom_id] : []
  );
  if (!students.length) throw createError(400, "No students in that class", "EMPTY_CLASS");
  const [billed] = await pool.query("SELECT student_id FROM fee_ledgers WHERE month = ? AND student_id IN (?)", [
    month,
    students.map((s) => s.id),
  ]);
  const already = new Set(billed.map((b) => b.student_id));
  const toBill = students.filter((s) => !already.has(s.id));
  // Sibling discount and concessions, worked out per student.
  const discounts = await discountsFor(
    toBill.map((s) => s.id),
    Number(amount)
  );
  const rows = toBill.map((s) => {
    const d = discounts.get(s.id) ?? { discount: 0, note: null };
    const due = Math.round((Number(amount) - d.discount) * 100) / 100;
    return [s.id, month, due_date, due, d.discount, d.note, 0, due > 0 ? "pending" : "paid"];
  });
  if (rows.length) {
    await pool.query(
      "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, discount, discount_note, amount_paid, status) VALUES ?",
      [rows]
    );
  }
  const total = rows.reduce((n, r) => n + r[3], 0);
  const discount = rows.reduce((n, r) => n + r[4], 0);
  return {
    month,
    created: toBill.length,
    skipped: already.size,
    total: Math.round(total * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    discounted: rows.filter((r) => r[4] > 0).length,
  };
}

/** Remove a fee entered by mistake. Refused once anything has been paid against it. */
export async function remove(id) {
  const fee = await getById(id);
  if (!fee) throw createError(404, "Fee record not found", "NOT_FOUND");
  if (Number(fee.amount_paid) > 0) {
    throw createError(400, "This fee has payments against it, so it can't be deleted", "FEE_HAS_PAYMENTS");
  }
  await pool.execute("DELETE FROM fee_ledgers WHERE id = ?", [id]);
}

/**
 * Fee challans (bank vouchers) to print: unpaid or partly paid fees for a month, with what a
 * challan shows — student, father/guardian, class, roll number, amount and due date.
 */
export async function challans({ month, classroom_id = null, fee_id = null }) {
  const where = [];
  const params = [];
  if (fee_id) {
    where.push("f.id = ?");
    params.push(fee_id);
  } else {
    where.push("f.month = ?", "f.amount_paid < f.amount_due");
    params.push(month);
    if (classroom_id) {
      where.push("e.classroom_id = ?");
      params.push(classroom_id);
    }
  }
  const [rows] = await pool.query(
    `SELECT f.id, f.month, f.due_date, f.amount_due, f.amount_paid, f.discount, f.discount_note,
            CONCAT(s.first_name, ' ', s.last_name) AS student_name, s.roll_number,
            c.name AS class_name, c.section, g.full_name AS guardian_name
     FROM fee_ledgers f
     JOIN students s ON s.id = f.student_id
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = 1
     LEFT JOIN guardians g ON g.id = sg.guardian_id
     WHERE ${where.join(" AND ")}
     ORDER BY c.name, s.roll_number IS NULL, s.roll_number, s.first_name`,
    params
  );
  return rows.map((r) => ({
    ...r,
    amount_due: Number(r.amount_due),
    amount_paid: Number(r.amount_paid),
    discount: Number(r.discount),
    payable: Number((Number(r.amount_due) - Number(r.amount_paid)).toFixed(2)),
    reference: feeReference(r.id), // 1Bill consumer number / Raast reference
  }));
}
