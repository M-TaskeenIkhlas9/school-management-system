import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { pageResult, pageWindow, whereClause } from "../../lib/pagination.js";

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
  const autoStatus = paid >= Number(amount_due) ? "paid" : paid > 0 ? "partial" : (status || "pending");
  const [result] = await pool.execute(
    "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, amount_paid, status, paid_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [student_id, month || null, due_date, amount_due, paid, autoStatus, paid_date || null]
  );
  return (await getById(result.insertId));
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
