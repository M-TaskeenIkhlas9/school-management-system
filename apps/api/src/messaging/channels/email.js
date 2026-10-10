import nodemailer from "nodemailer";

/**
 * Email over SMTP. Without SMTP_HOST the message is "simulated": recorded in the outbox but
 * not delivered, so the whole flow can be tried safely. EMAIL_REDIRECT_TO sends every email to
 * one test address instead of parents.
 */
let transporter = null;

function transport() {
  if (!process.env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export default {
  name: "email",
  mode: () => (process.env.SMTP_HOST ? "live" : "simulated"),
  enabled: () => true,
  async send({ to, toName, subject, body }) {
    const t = transport();
    const deliveredTo = process.env.EMAIL_REDIRECT_TO || to;
    if (!t) return { status: "simulated", provider: "simulated", providerMessageId: null, deliveredTo };
    try {
      const info = await t.sendMail({
        from: process.env.EMAIL_FROM || process.env.SMTP_USER,
        to: toName ? `"${String(toName).replace(/"/g, "")}" <${deliveredTo}>` : deliveredTo,
        subject,
        text: body,
      });
      return { status: "sent", provider: "smtp", providerMessageId: info.messageId ?? null, deliveredTo };
    } catch (err) {
      // Connection problems and 4xx SMTP replies are temporary; 5xx (bad address) are permanent.
      const permanent = Number(err.responseCode) >= 500;
      throw Object.assign(new Error(err.message), { retryable: !permanent });
    }
  },
};
