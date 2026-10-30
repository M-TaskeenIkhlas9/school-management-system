/**
 * Fee payments that arrive online: 1Bill, Raast and bank transfers. Each bank transaction is kept
 * once in incoming_payments (a repeated notice changes nothing) and, when it can be matched to a fee
 * by its payment reference, recorded against that fee like a payment at the office. What can't be
 * matched — no reference, a mistyped one, more than is due — waits for the accountant on the Fees page.
 */
import { createHash } from "node:crypto";
import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { pageResult, pageWindow } from "../../lib/pagination.js";
import { applyPayment } from "../fees/fees.service.js";
import { school } from "../settings/school.js";
import { findFeeId } from "./reference.js";

const METHOD = { "1bill": "1bill", raast: "raast", bank: "bank" };
const CHANNEL_LABEL = { "1bill": "1Bill", raast: "Raast", bank: "Bank transfer" };
const dateOnly = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

async function byId(conn, id) {
  const [[row]] = await conn.execute("SELECT * FROM incoming_payments WHERE id = ?", [id]);
  return row ? { ...row, amount: Number(row.amount) } : null;
}

/** Record the payment against the fee; on a business error (already paid, too much) say why instead. */
async function tryApply(conn, row, feeId, userId) {
  try {
    const receipt = await applyPayment(
      conn,
      feeId,
      {
        amount: row.amount,
        paid_on: dateOnly(row.paid_on),
        method: METHOD[row.channel],
        note: [CHANNEL_LABEL[row.channel], row.payer].filter(Boolean).join(" · ").slice(0, 200),
        reference: row.transaction_id,
      },
      userId,
      { allowFine: true }
    );
    return { receipt };
  } catch (err) {
    if (err.status && err.status < 500) return { problem: err.message };
    throw err;
  }
}

/**
 * Take in one payment. `fee_id` is given when the channel already knows the fee (1Bill);
 * otherwise the reference text is searched for a payment reference.
 * Returns the incoming payment, with `duplicate: true` if this transaction was seen before.
 */
export async function receive({ channel, transaction_id, amount, paid_on, reference = null, payer = null, fee_id }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let id;
    try {
      // Inserting first claims the transaction id, so two copies of a notice can't both be applied.
      [{ insertId: id }] = await conn.execute(
        `INSERT INTO incoming_payments (channel, transaction_id, amount, paid_on, reference, payer, status)
         VALUES (?, ?, ?, ?, ?, ?, 'unmatched')`,
        [channel, transaction_id, amount, paid_on || schoolToday(), reference, payer]
      );
    } catch (err) {
      if (err.code !== "ER_DUP_ENTRY") throw err;
      await conn.rollback();
      const [[seen]] = await pool.execute("SELECT id FROM incoming_payments WHERE channel = ? AND transaction_id = ?", [
        channel,
        transaction_id,
      ]);
      return { ...(await byId(pool, seen.id)), duplicate: true };
    }
    const row = await byId(conn, id);
    const feeId = fee_id ?? findFeeId(reference);
    if (!feeId) {
      await conn.execute("UPDATE incoming_payments SET note = ? WHERE id = ?", ["No payment reference found", id]);
    } else {
      const { receipt, problem } = await tryApply(conn, row, feeId, null);
      if (receipt) {
        await conn.execute(
          "UPDATE incoming_payments SET status = 'matched', fee_id = ?, fee_payment_id = ? WHERE id = ?",
          [feeId, receipt.payment_id, id]
        );
      } else {
        const [[exists]] = await conn.execute("SELECT id FROM fee_ledgers WHERE id = ?", [feeId]);
        await conn.execute("UPDATE incoming_payments SET fee_id = ?, note = ? WHERE id = ?", [
          exists ? feeId : null,
          problem.slice(0, 200),
          id,
        ]);
      }
    }
    await conn.commit();
    return byId(pool, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** One page of online payments (newest first), with the fee's student. */
export async function list({ status, ...page }) {
  const where = status ? "WHERE i.status = ?" : "";
  const params = status ? [status] : [];
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM incoming_payments i ${where}`, params);
  const { limit, offset } = pageWindow(page);
  const [rows] = await pool.query(
    `SELECT i.*, f.month, CONCAT(s.first_name, ' ', s.last_name) AS student_name, u.username AS resolved_by_name
     FROM incoming_payments i
     LEFT JOIN fee_ledgers f ON f.id = i.fee_id
     LEFT JOIN students s ON s.id = f.student_id
     LEFT JOIN users u ON u.id = i.resolved_by
     ${where}
     ORDER BY i.paid_on DESC, i.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return pageResult(
    rows.map((r) => ({ ...r, amount: Number(r.amount) })),
    total,
    page
  );
}

/** Counts for the Fees page: payments waiting to be matched, and what came in online this month. */
export async function summary() {
  const month = schoolToday().slice(0, 7);
  const [[row]] = await pool.query(
    `SELECT SUM(status = 'unmatched') AS unmatched,
            SUM(CASE WHEN status = 'matched' AND DATE_FORMAT(paid_on, '%Y-%m') = ? THEN amount ELSE 0 END) AS this_month
     FROM incoming_payments`,
    [month]
  );
  return { unmatched: Number(row.unmatched) || 0, this_month: Number(row.this_month) || 0 };
}

// Words in a transfer's description that are about the transfer, not the person who sent it.
const NOT_NAMES = new Set(
  "raast p2p p2m ibft ift transfer funds fund payment paid from school fees fee month monthly online mobile bank account".split(
    " "
  )
);

/** Likely name words from the payer or, without one, the description: "RAAST P2P IQBAL HUSSAIN fee" → [iqbal, hussain]. */
export function nameWords(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .match(/\p{L}{3,}/gu);
  return [...new Set((words ?? []).filter((w) => !NOT_NAMES.has(w)))].slice(0, 4);
}

/**
 * Unpaid fees this payment could be for: the same amount (with or without the late fine) first,
 * then a parent or student whose name looks like the payer's. `q` narrows by student or parent name.
 */
export async function candidates(id, q = "") {
  const row = await byId(pool, id);
  if (!row) throw createError(404, "Payment not found", "NOT_FOUND");
  const names = nameWords(row.payer || row.reference);
  const nameScore = names.length
    ? names.map(() => "(g.full_name LIKE ? OR CONCAT(s.first_name, ' ', s.last_name) LIKE ?)").join(" + ")
    : "0";
  const like = `%${q.trim()}%`;
  const [rows] = await pool.query(
    `SELECT f.id, f.month, f.due_date, f.amount_due, f.amount_paid,
            CONCAT(s.first_name, ' ', s.last_name) AS student_name, g.full_name AS guardian_name,
            c.name AS class_name
     FROM fee_ledgers f
     JOIN students s ON s.id = f.student_id
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = 1
     LEFT JOIN guardians g ON g.id = sg.guardian_id
     WHERE f.amount_paid < f.amount_due
       AND (? = '' OR CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR g.full_name LIKE ?)
     ORDER BY (ROUND(f.amount_due - f.amount_paid, 2) IN (?, ?)) DESC,
              (${nameScore}) DESC,
              f.due_date, f.id
     LIMIT 15`,
    [
      q.trim(),
      like,
      like,
      row.amount,
      Math.round((row.amount - school().late_fine) * 100) / 100,
      ...names.flatMap((w) => [`%${w}%`, `%${w}%`]),
    ]
  );
  return rows.map((r) => ({
    ...r,
    remaining: Math.round((Number(r.amount_due) - Number(r.amount_paid)) * 100) / 100,
  }));
}

/** The accountant matches a waiting payment to a fee. */
export async function match(id, feeId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[row]] = await conn.execute("SELECT * FROM incoming_payments WHERE id = ? FOR UPDATE", [id]);
    if (!row) throw createError(404, "Payment not found", "NOT_FOUND");
    if (row.status !== "unmatched") throw createError(409, "This payment has already been dealt with", "NOT_WAITING");
    const { receipt, problem } = await tryApply(conn, { ...row, amount: Number(row.amount) }, feeId, userId);
    if (problem) throw createError(400, problem, "CANNOT_MATCH");
    await conn.execute(
      `UPDATE incoming_payments SET status = 'matched', fee_id = ?, fee_payment_id = ?, note = NULL,
              resolved_by = ?, resolved_at = NOW() WHERE id = ?`,
      [feeId, receipt.payment_id, userId, id]
    );
    await conn.commit();
    return byId(pool, id);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Set aside a payment that is not a fee (a donation, a refund back to the school …). */
export async function ignore(id, note, userId) {
  const [res] = await pool.execute(
    `UPDATE incoming_payments SET status = 'ignored', note = ?, resolved_by = ?, resolved_at = NOW()
     WHERE id = ? AND status = 'unmatched'`,
    [note || "Not a fee payment", userId, id]
  );
  if (!res.affectedRows) {
    const row = await byId(pool, id);
    if (!row) throw createError(404, "Payment not found", "NOT_FOUND");
    throw createError(409, "This payment has already been dealt with", "NOT_WAITING");
  }
  return byId(pool, id);
}

/**
 * Credits from a bank statement (Raast and other transfers into the school account). Lines without
 * a transaction id get one made from their contents, so importing the same statement twice is safe.
 */
export async function importStatement({ channel, rows }) {
  const result = { matched: 0, unmatched: 0, duplicates: 0 };
  for (const r of rows) {
    const transaction_id =
      r.transaction_id ||
      `stmt-${createHash("sha1")
        .update([r.paid_on, r.amount, r.reference ?? "", r.payer ?? ""].join("|"))
        .digest("hex")
        .slice(0, 24)}`;
    const saved = await receive({ channel, ...r, transaction_id });
    if (saved.duplicate) result.duplicates += 1;
    else result[saved.status === "matched" ? "matched" : "unmatched"] += 1;
  }
  return result;
}
