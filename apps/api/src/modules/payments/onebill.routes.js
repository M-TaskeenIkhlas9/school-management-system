/**
 * 1Bill biller API. When a parent opens "Bill payment → School fee" in a bank app, JazzCash or
 * Easypaisa and types the challan's consumer number, 1LINK (through the school's sponsor bank or
 * aggregator) calls BillInquiry to show the bill, then BillPayment once the parent pays. The fee is
 * marked paid straight away and the payment appears on the Fees page.
 *
 * The message format follows the usual 1Bill biller convention: amounts as a sign and 13 digits in
 * paisa ("+0000000250000" = 2,500.00), dates YYYYMMDD, and response codes
 *   00 done · 01 consumer number not found · 02 blocked (student left) · 03 already paid ·
 *   04 invalid data (wrong amount, missing field) · 05 could not be processed.
 * The exact format comes with the school's 1Bill onboarding; if it differs, only this file changes.
 *
 * No login: 1LINK sends the username and password agreed at onboarding (ONEBILL_USERNAME /
 * ONEBILL_PASSWORD), and ONEBILL_ALLOWED_IPS can limit calls to its addresses.
 */
import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";
import { schoolToday } from "../../config/env.js";
import { school } from "../settings/school.js";
import { feeIdFromReference } from "./reference.js";
import { receive } from "./payments.service.js";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: Number(process.env.WEBHOOK_RATE_LIMIT) || 600 }));

const same = (a, b) => {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
};

router.use((req, res, next) => {
  const user = process.env.ONEBILL_USERNAME;
  const password = process.env.ONEBILL_PASSWORD;
  if (!user || !password) {
    return res.status(503).json({ response_Code: "05", message: "1Bill is not set up on this server" });
  }
  const allowed = (process.env.ONEBILL_ALLOWED_IPS || "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean);
  const ip = String(req.ip ?? "").replace(/^::ffff:/, "");
  // Both checks always run, so a wrong username takes as long as a wrong password.
  const userOk = same(req.get("username"), user);
  const passwordOk = same(req.get("password"), password);
  if (!userOk || !passwordOk || (allowed.length && !allowed.includes(ip))) {
    logger.warn({ ip }, "Refused a 1Bill call");
    return res.status(401).json({ response_Code: "04", message: "Not allowed" });
  }
  next();
});

// ---------- Format ----------

/** 2500 → "+0000000250000" */
export const toAmount = (n) => `+${String(Math.round(Number(n) * 100)).padStart(13, "0")}`;

/** "+0000000250000" → 2500; a plain number ("2500.00") is taken as rupees. */
export function fromAmount(value) {
  const s = String(value ?? "").trim();
  if (/^\+?\d{13}$/.test(s)) return Number(s.replace(/^\+/, "")) / 100;
  return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN;
}

const isoDay = (d) => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);
const ymd = (d) => (d ? isoDay(d).replaceAll("-", "") : "");

/** "20261030" → "2026-10-30" (or null when it isn't a date). */
const isoFrom = (s) => (/^\d{8}$/.test(String(s)) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : null);

// ---------- Bill ----------

async function billFor(consumerNumber) {
  const id = feeIdFromReference(String(consumerNumber ?? "").trim());
  if (!id) return null;
  const [[fee]] = await pool.execute(
    `SELECT f.*, s.first_name, s.last_name, s.is_active
     FROM fee_ledgers f JOIN students s ON s.id = f.student_id WHERE f.id = ?`,
    [id]
  );
  if (!fee) return null;
  const [[last]] = await pool.execute(
    "SELECT amount, late_fine, paid_on, reference FROM fee_payments WHERE fee_id = ? ORDER BY id DESC LIMIT 1",
    [id]
  );
  const left = Math.round((Number(fee.amount_due) - Number(fee.amount_paid)) * 100) / 100;
  return {
    fee,
    last,
    left,
    dueDay: isoDay(fee.due_date),
    afterDue: left + school().late_fine,
    name: `${fee.first_name} ${fee.last_name}`.trim(),
  };
}

router.post("/BillInquiry", async (req, res) => {
  const bill = await billFor(req.body?.consumer_number);
  if (!bill) return res.json({ response_Code: "01" });
  const { fee, last, left } = bill;
  const status = !fee.is_active ? "B" : left <= 0 ? "P" : "U";
  const paid = status === "P" && last;
  res.json({
    response_Code: status === "B" ? "02" : "00",
    consumer_Detail: bill.name.slice(0, 30).padEnd(30, " "),
    bill_status: status,
    due_date: ymd(fee.due_date),
    amount_within_dueDate: toAmount(Math.max(left, 0)),
    amount_after_dueDate: toAmount(Math.max(left > 0 ? bill.afterDue : 0, 0)),
    billing_month: fee.month ? fee.month.slice(2).replace("-", "") : "",
    date_paid: paid ? ymd(last.paid_on) : "",
    amount_paid: paid ? toAmount(Number(last.amount) + Number(last.late_fine)) : "",
    tran_auth_Id: paid && last.reference ? last.reference : "",
    reserved: "",
  });
});

router.post("/BillPayment", async (req, res) => {
  const b = req.body ?? {};
  const tranId = String(b.tran_auth_id ?? "").trim();
  const amount = fromAmount(b.transaction_amount);
  if (!/^[\w-]{1,64}$/.test(tranId) || !(amount > 0)) return res.json({ response_Code: "04" });

  const bill = await billFor(b.consumer_number);
  if (!bill) return res.json({ response_Code: "01" });
  if (!bill.fee.is_active) return res.json({ response_Code: "02" });

  // The same transaction sent again (the bank retrying after a timeout) is answered as done.
  const [[seen]] = await pool.execute(
    "SELECT amount, status FROM incoming_payments WHERE channel = '1bill' AND transaction_id = ?",
    [tranId]
  );
  if (seen) {
    const sameOne = seen.status === "matched" && Math.abs(Number(seen.amount) - amount) < 0.005;
    return res.json({ response_Code: sameOne ? "00" : "03", Identification_parameter: "", reserved: "" });
  }
  if (bill.left <= 0) return res.json({ response_Code: "03" });
  // A voucher is paid in full: the bill amount, or after the due date the amount with the fine.
  const day = isoFrom(b.tran_date) ?? schoolToday();
  const expected = day > bill.dueDay ? [bill.left, bill.afterDue] : [bill.left];
  if (!expected.some((x) => Math.abs(x - amount) < 0.005)) return res.json({ response_Code: "04" });

  const saved = await receive({
    channel: "1bill",
    transaction_id: tranId,
    amount,
    paid_on: day,
    reference: String(b.consumer_number),
    payer: b.bank_mnemonic ? `via ${String(b.bank_mnemonic).slice(0, 40)}` : null,
    fee_id: bill.fee.id,
  });
  if (saved.status !== "matched") {
    logger.warn({ tranId, note: saved.note }, "1Bill payment could not be applied");
    return res.json({ response_Code: "03" });
  }
  res.json({ response_Code: "00", Identification_parameter: bill.name.slice(0, 20), reserved: "" });
});

export default router;
