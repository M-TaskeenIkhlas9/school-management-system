/** Action type: record a fee payment, applied to the oldest unpaid fees first. */
import pool from "../../db/pool.js";
import { schoolToday } from "../../config/env.js";
import { createError } from "../../middleware/errorHandler.js";
import { formatMoney } from "../../messaging/audiences.js";

const statusFor = (paid, due) => (paid >= due ? "paid" : paid > 0 ? "partial" : "pending");

export const feePayment = {
  type: "record_fee_payment",
  approvePermission: "fees:write",

  async propose({ student_id, amount }) {
    const value = Number(amount);
    if (!(value > 0)) throw createError(400, "The payment must be more than zero", "VALIDATION_ERROR");
    const [[student]] = await pool.execute(
      "SELECT id, CONCAT(first_name, ' ', last_name) AS name FROM students WHERE id = ? AND is_active = 1",
      [student_id]
    );
    if (!student) throw createError(404, `No student with id ${student_id}`, "NOT_FOUND");
    const [fees] = await pool.execute(
      "SELECT id, month, due_date, amount_due, amount_paid FROM fee_ledgers WHERE student_id = ? AND status != 'paid' ORDER BY due_date, id",
      [student.id]
    );
    const owed = fees.reduce((sum, f) => sum + Number(f.amount_due) - Number(f.amount_paid), 0);
    if (!fees.length) throw createError(400, `${student.name} has no unpaid fees`, "NOTHING_OWED");
    if (value > owed + 1e-9) {
      throw createError(
        400,
        `${formatMoney(value)} is more than the ${formatMoney(owed)} outstanding`,
        "PAYMENT_EXCEEDS_FEE"
      );
    }
    let left = value;
    const allocations = [];
    for (const f of fees) {
      if (left <= 0) break;
      const due = Number(f.amount_due);
      const before = Number(f.amount_paid);
      const apply = Number(Math.min(due - before, left).toFixed(2));
      left = Number((left - apply).toFixed(2));
      const after = Number((before + apply).toFixed(2));
      allocations.push({
        fee_id: f.id,
        due_date: f.due_date instanceof Date ? f.due_date.toISOString().slice(0, 10) : String(f.due_date).slice(0, 10),
        amount_due: due,
        paid_before: before,
        apply,
        paid_after: after,
        status_after: statusFor(after, due),
      });
    }
    const payload = { student_id: student.id, student_name: student.name, amount: value, allocations };
    return {
      summary: `Record a ${formatMoney(value)} payment for ${student.name}`,
      payload,
      preview: {
        student: student.name,
        amount: formatMoney(value),
        outstanding_before: formatMoney(owed),
        allocations,
      },
      approverNeeds: ["fees:read"],
    };
  },

  /** Runs in the approval transaction; refuses if the fees changed since the preview. */
  async execute(payload, conn) {
    for (const a of payload.allocations) {
      const [[row]] = await conn.execute("SELECT amount_paid FROM fee_ledgers WHERE id = ? FOR UPDATE", [a.fee_id]);
      if (!row || Number(row.amount_paid) !== a.paid_before) {
        throw createError(409, "These fees changed after the payment was prepared. Prepare it again.", "STALE_ACTION");
      }
      await conn.execute(
        "UPDATE fee_ledgers SET amount_paid = ?, status = ?, paid_date = IF(? = 'paid', ?, paid_date) WHERE id = ?",
        [a.paid_after, a.status_after, a.status_after, schoolToday(), a.fee_id]
      );
    }
    return { updated_fee_records: payload.allocations.length };
  },
};
