/**
 * Public callbacks from messaging providers and the school's bank. No login: every request must carry
 * the sender's signature (Twilio: X-Twilio-Signature; Meta: X-Hub-Signature-256; bank: X-Signature),
 * checked against our secret.
 * Mounted before the JSON parser so the signature is checked against the exact raw body.
 */
import { Router, raw, urlencoded } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { createError } from "../../middleware/errorHandler.js";
import { applyStatus, handleInbound } from "../../messaging/receipts.js";
import { statusCallbackUrl } from "../../messaging/channels/sms.js";
import { receive } from "../payments/payments.service.js";

const router = Router();
router.use(rateLimit({ windowMs: 60_000, limit: Number(process.env.WEBHOOK_RATE_LIMIT) || 600 }));

function safeEqual(a, b) {
  const x = Buffer.from(String(a ?? ""));
  const y = Buffer.from(String(b ?? ""));
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------- Twilio (SMS) ----------

/** Twilio signs the public URL plus the POSTed fields sorted by name. */
export function twilioSignature(token, url, params) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

function verifyTwilio(req, _res, next) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  const url = statusCallbackUrl(req.originalUrl);
  if (!token || !url) return next(createError(503, "SMS webhooks are not configured", "WEBHOOK_NOT_CONFIGURED"));
  if (!safeEqual(twilioSignature(token, url, req.body ?? {}), req.get("X-Twilio-Signature"))) {
    return next(createError(403, "Invalid signature", "BAD_SIGNATURE"));
  }
  next();
}

const TWILIO_STATUS = { sent: "sent", delivered: "delivered", read: "read", undelivered: "failed", failed: "failed" };

router.post("/twilio/status", urlencoded({ extended: false }), verifyTwilio, async (req, res) => {
  const b = req.body;
  await applyStatus({
    provider: "twilio",
    providerMessageId: b.MessageSid,
    status: TWILIO_STATUS[b.MessageStatus] ?? b.MessageStatus,
    error: b.ErrorCode ? `error ${b.ErrorCode}` : null,
    raw: b,
  });
  res.status(204).end();
});

router.post("/twilio/inbound", urlencoded({ extended: false }), verifyTwilio, async (req, res) => {
  await handleInbound({ provider: "twilio", channel: "sms", from: req.body.From, text: req.body.Body, raw: req.body });
  res.type("text/xml").send("<Response></Response>"); // no automatic reply
});

// ---------- Meta (WhatsApp Cloud API) ----------

router.get("/whatsapp", (req, res) => {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && req.query["hub.mode"] === "subscribe" && safeEqual(req.query["hub.verify_token"], token)) {
    return res.type("text/plain").send(String(req.query["hub.challenge"] ?? ""));
  }
  res.status(403).end();
});

router.post("/whatsapp", raw({ type: "*/*", limit: "1mb" }), async (req, res, next) => {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return next(createError(503, "WhatsApp webhooks are not configured", "WEBHOOK_NOT_CONFIGURED"));
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  if (!safeEqual(expected, req.get("X-Hub-Signature-256"))) {
    return next(createError(403, "Invalid signature", "BAD_SIGNATURE"));
  }
  let data;
  try {
    data = JSON.parse(body.toString("utf8"));
  } catch {
    return next(createError(400, "Malformed JSON", "INVALID_JSON"));
  }

  for (const entry of data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      for (const s of value.statuses ?? []) {
        const err = s.errors?.[0];
        await applyStatus({
          provider: "meta",
          providerMessageId: s.id,
          status: s.status,
          error: err ? `${err.title || err.message} (code ${err.code})` : null,
          raw: s,
        });
      }
      for (const m of value.messages ?? []) {
        await handleInbound({
          provider: "meta",
          channel: "whatsapp",
          from: `+${m.from}`,
          text: m.text?.body ?? m.button?.text ?? "",
          raw: m,
        });
      }
    }
  }
  res.status(200).end();
});

// ---------- Bank (Raast and other transfers into the school account) ----------

/**
 * Field names differ between banks; the usual ones are accepted here. A notice is
 * { transaction_id, amount, date, purpose (what the parent wrote), payer_name, channel? }.
 */
export function bankNotice(n) {
  const transaction_id = String(n.transaction_id ?? n.txn_id ?? n.stan ?? "").trim();
  const amount = Number(n.amount);
  const day = String(n.date ?? n.paid_at ?? n.transaction_date ?? "").slice(0, 10);
  if (!/^[\w-]{1,64}$/.test(transaction_id) || !(amount > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const reference = n.purpose ?? n.reference ?? n.remarks ?? n.narration ?? null;
  const payer = n.payer_name ?? n.sender_name ?? null;
  return {
    channel: /ibft|bank/i.test(n.channel ?? "") ? "bank" : "raast",
    transaction_id,
    amount: Math.round(amount * 100) / 100,
    paid_on: day,
    reference: reference ? String(reference).slice(0, 140) : null,
    payer: payer ? String(payer).slice(0, 150) : null,
  };
}

router.post("/raast", raw({ type: "*/*", limit: "100kb" }), async (req, res, next) => {
  const secret = process.env.RAAST_WEBHOOK_SECRET;
  if (!secret) return next(createError(503, "Bank notices are not configured", "WEBHOOK_NOT_CONFIGURED"));
  const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  if (!safeEqual(expected, req.get("X-Signature"))) return next(createError(403, "Invalid signature", "BAD_SIGNATURE"));
  let data;
  try {
    data = JSON.parse(body.toString("utf8"));
  } catch {
    return next(createError(400, "Malformed JSON", "INVALID_JSON"));
  }
  const notices = (Array.isArray(data) ? data : [data]).map((item) => bankNotice(item ?? {}));
  if (!notices.length || notices.some((n) => !n)) {
    return next(createError(400, "A notice is missing its transaction id, amount or date", "BAD_NOTICE"));
  }
  const results = [];
  for (const notice of notices) {
    const saved = await receive(notice);
    results.push({ transaction_id: notice.transaction_id, status: saved.status, duplicate: !!saved.duplicate });
  }
  res.json({ received: results });
});

export default router;
