import nodemailer from "nodemailer";

/**
 * Email transport.
 *
 * - SMTP_HOST set   → real delivery via SMTP (Gmail app password, Brevo, Mailgun, …)
 * - SMTP_HOST unset → "simulated": nothing leaves the server, but the caller still
 *                     records the email in the outbox so the flow can be tested.
 * - EMAIL_REDIRECT_TO set → every email goes to that address instead of the real
 *                     guardian (safe testing against real SMTP).
 */
let transporter = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

export function emailMode() {
  return process.env.SMTP_HOST ? "smtp" : "simulated";
}

/**
 * Send one plain-text email.
 * @returns {Promise<{status: "sent"|"simulated", messageId: string|null, deliveredTo: string}>}
 */
export async function sendEmail({ to, toName, subject, text }) {
  const deliveredTo = process.env.EMAIL_REDIRECT_TO || to;
  const transport = getTransporter();

  if (!transport) {
    return { status: "simulated", messageId: null, deliveredTo };
  }

  const info = await transport.sendMail({
    from: process.env.EMAIL_FROM || process.env.SMTP_USER,
    to: toName ? `"${toName.replace(/"/g, "")}" <${deliveredTo}>` : deliveredTo,
    subject,
    text,
  });
  return { status: "sent", messageId: info.messageId || null, deliveredTo };
}
