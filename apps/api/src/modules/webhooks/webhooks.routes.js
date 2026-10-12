/**
 * Public callbacks from messaging providers. No login: every request must carry the provider's
 * signature (Twilio: X-Twilio-Signature; Meta: X-Hub-Signature-256), checked against our secret.
 * Mounted before the JSON parser so the signature is checked against the exact raw body.
 */
import { Router, raw, urlencoded } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { createError } from "../../middleware/errorHandler.js";
import { applyStatus, handleInbound } from "../../messaging/receipts.js";
import { statusCallbackUrl } from "../../messaging/channels/sms.js";

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

export default router;
