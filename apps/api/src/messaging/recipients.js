/**
 * Turn students into recipients: one per primary guardian (siblings combined into one
 * message), on a channel that guardian has agreed to. Students without a reachable guardian
 * are listed as skipped with the reason, so the approver sees exactly who will not hear.
 */
import pool from "../db/pool.js";
import { availableChannels } from "./channels/index.js";
import { formatMoney } from "./audiences.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Address for a channel if the guardian can be reached on it, else the reason why not. */
export function reachability(guardian, channel) {
  if (channel === "email") {
    if (!guardian.email || !EMAIL_RE.test(guardian.email)) return { reason: "no valid email" };
    if (!guardian.consent_email) return { reason: "has not agreed to email" };
    return { address: guardian.email };
  }
  if (channel === "sms" || channel === "whatsapp") {
    if (!guardian.phone) return { reason: "no phone number" };
    if (!guardian[`consent_${channel}`])
      return { reason: `has not agreed to ${channel === "sms" ? "SMS" : "WhatsApp"}` };
    return { address: guardian.phone };
  }
  return { reason: `unknown channel ${channel}` };
}

/**
 * Channel for a guardian: their preferred channel first, then the school's fallback order,
 * limited to channels this school has enabled.
 */
export function chooseChannel(guardian, enabled = availableChannels()) {
  const order = [guardian.preferred_channel, ...(process.env.CHANNEL_ORDER || "whatsapp,sms,email").split(",")]
    .map((c) => c && c.trim())
    .filter((c, i, all) => c && enabled.includes(c) && all.indexOf(c) === i);
  const reasons = [];
  for (const channel of order) {
    const r = reachability(guardian, channel);
    if (r.address) return { channel, address: r.address };
    reasons.push(r.reason);
  }
  return { reason: reasons.length ? [...new Set(reasons)].join("; ") : "no messaging channel is enabled" };
}

/** @param students [{ id, name, class_name, vars }] */
export async function buildRecipients(students) {
  if (!students.length) return { recipients: [], skipped: [] };
  const [rows] = await pool.query(
    `SELECT sg.student_id, g.id, g.full_name, g.email, g.phone, g.preferred_channel,
            g.consent_email, g.consent_sms, g.consent_whatsapp
     FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id AND g.is_active = 1
     WHERE sg.is_primary = 1 AND sg.student_id IN (?)`,
    [students.map((s) => s.id)]
  );
  const guardianOf = new Map(rows.map((r) => [r.student_id, r]));
  const byGuardian = new Map();
  const skipped = [];

  for (const student of students) {
    const g = guardianOf.get(student.id);
    if (!g) {
      skipped.push({ student: student.name, reason: "no guardian on file" });
      continue;
    }
    const entry = byGuardian.get(g.id) ?? { guardian: g, students: [] };
    entry.students.push(student);
    byGuardian.set(g.id, entry);
  }

  const recipients = [];
  for (const { guardian, students: kids } of byGuardian.values()) {
    const choice = chooseChannel(guardian);
    if (!choice.channel) {
      skipped.push({
        student: kids.map((k) => k.name).join(", "),
        guardian: guardian.full_name,
        reason: choice.reason,
      });
      continue;
    }
    // Combine per-student variables for siblings (amounts add up; details are listed).
    const amount = kids.reduce((sum, k) => sum + (Number(k.vars.amount_owed) || 0), 0);
    const oldest = kids
      .map((k) => k.vars.oldest_due_date)
      .filter(Boolean)
      .sort()[0];
    const details = kids.map((k) => k.vars.absence_detail).filter(Boolean);
    recipients.push({
      guardian_id: guardian.id,
      name: guardian.full_name,
      channel: choice.channel,
      to: choice.address,
      student_names: kids.map((k) => k.name).join(" and "),
      vars: {
        guardian_name: guardian.full_name,
        student_names: kids.map((k) => k.name).join(" and "),
        class_name: [...new Set(kids.map((k) => k.class_name))].join(", "),
        ...(amount ? { amount_owed: formatMoney(amount) } : {}),
        ...(oldest ? { oldest_due_date: oldest } : {}),
        ...(details.length ? { absence_detail: [...new Set(details)].join("; ") } : {}),
      },
    });
  }
  return { recipients, skipped };
}
