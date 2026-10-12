/**
 * SMS through Twilio's REST API (no SDK). SMS_PROVIDER: "twilio" sends for real, "simulated"
 * records messages without sending, "off" (default) disables the channel so nobody is
 * routed to it. SMS_REDIRECT_TO sends every SMS to one test number instead of parents.
 */
import { smsSegments } from "./text.js";

const provider = () => (process.env.SMS_PROVIDER || "off").toLowerCase();

function twilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    (process.env.TWILIO_SMS_FROM || process.env.TWILIO_MESSAGING_SERVICE_SID)
  );
}

// Twilio errors that will never succeed on retry (bad/unreachable number, opted out, blocked).
const PERMANENT_TWILIO_CODES = new Set([21211, 21214, 21408, 21610, 21612, 21614, 30003, 30004, 30005, 30006, 30007]);

export function statusCallbackUrl(path) {
  const base = process.env.PUBLIC_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

export default {
  name: "sms",
  mode: () => (provider() === "twilio" ? (twilioConfigured() ? "live" : "misconfigured") : provider()),
  enabled() {
    const mode = this.mode();
    return mode === "live" || mode === "simulated";
  },
  /** Estimated cost of one message (SMS_COST_PER_SEGMENT, in the school's currency). */
  estimate(body) {
    const { segments } = smsSegments(body);
    return { segments, cost: segments * (Number(process.env.SMS_COST_PER_SEGMENT) || 0) };
  },
  async send({ to, body }) {
    const deliveredTo = process.env.SMS_REDIRECT_TO || to;
    if (this.mode() !== "live")
      return { status: "simulated", provider: "simulated", providerMessageId: null, deliveredTo };

    const sid = process.env.TWILIO_ACCOUNT_SID;
    const form = new URLSearchParams({ To: deliveredTo, Body: body });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID)
      form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
    else form.set("From", process.env.TWILIO_SMS_FROM);
    const callback = statusCallbackUrl("/webhooks/twilio/status");
    if (callback) form.set("StatusCallback", callback);

    let res;
    try {
      res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw Object.assign(new Error(`SMS provider unreachable: ${err.message}`), { retryable: true });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const permanent =
        PERMANENT_TWILIO_CODES.has(Number(data.code)) || (res.status >= 400 && res.status < 500 && res.status !== 429);
      throw Object.assign(
        new Error(`SMS failed: ${data.message || res.statusText}${data.code ? ` (code ${data.code})` : ""}`),
        {
          retryable: !permanent,
          code: data.code,
        }
      );
    }
    return { status: "sent", provider: "twilio", providerMessageId: data.sid, deliveredTo };
  },
};
