/** Action type: message a group of parents (approval required before anything is sent). */
import { createError } from "../../middleware/errorHandler.js";
import { resolveAudience } from "../../messaging/audiences.js";
import { buildRecipients } from "../../messaging/recipients.js";
import { getTemplate, renderTemplate } from "../../messaging/templates.js";
import { channelModes } from "../../messaging/channels/index.js";

const MAX_RECIPIENTS = Number(process.env.MESSAGE_MAX_RECIPIENTS) || 500;

/** Render every recipient's message from the stored subject/body templates. */
export function renderPreview(payload) {
  const school = process.env.SCHOOL_NAME || "the school";
  return {
    audience: payload.audience_label,
    subject_template: payload.subject,
    body_template: payload.body,
    channel_modes: channelModes(),
    recipients: payload.recipients.map((r) => {
      const vars = { ...r.vars, school_name: school, message: payload.message ?? "" };
      return {
        guardian_id: r.guardian_id,
        name: r.name,
        channel: r.channel,
        to: r.to,
        student_names: r.student_names,
        subject: renderTemplate(payload.subject, vars),
        body: renderTemplate(payload.body, vars),
      };
    }),
    skipped: payload.skipped,
  };
}

export const sendMessages = {
  type: "send_parent_messages",
  approvePermission: "messages:send",

  /**
   * @param spec { audience, date?, days?, class_name?, student_ids?, template?, message?, subject?, body? }
   * @returns {{ summary, payload, preview, approverNeeds }} or throws when nobody can be reached.
   */
  async propose(spec, req) {
    const audience = await resolveAudience(req, spec);
    if (!audience.students.length) throw createError(400, `Nobody matches: ${audience.label}.`, "EMPTY_AUDIENCE");

    const templateKey =
      spec.template ||
      (spec.audience === "fee_defaulters"
        ? "fee_reminder"
        : spec.audience.startsWith("absen")
          ? "absence_alert"
          : "announcement");
    const template = await getTemplate(templateKey);
    if (!template) throw createError(400, `Unknown template "${templateKey}"`, "VALIDATION_ERROR");
    if (templateKey === "announcement" && !spec.message && !spec.body) {
      throw createError(400, "An announcement needs the message text.", "VALIDATION_ERROR");
    }

    const { recipients, skipped } = await buildRecipients(audience.students);
    if (!recipients.length) {
      throw createError(
        400,
        `${audience.students.length} student(s) match, but no guardian can be reached: ${skipped.map((s) => `${s.student} (${s.reason})`).join("; ")}`,
        "NO_REACHABLE_RECIPIENTS"
      );
    }
    if (recipients.length > MAX_RECIPIENTS) {
      throw createError(
        400,
        `That is ${recipients.length} recipients; the limit per message is ${MAX_RECIPIENTS}.`,
        "TOO_MANY_RECIPIENTS"
      );
    }

    const payload = {
      audience: spec.audience,
      audience_label: audience.label,
      template: templateKey,
      subject: spec.subject || template.subject,
      body: spec.body || template.body,
      message: spec.message ?? null,
      recipients,
      skipped,
    };
    const counts = recipients.reduce((acc, r) => ({ ...acc, [r.channel]: (acc[r.channel] || 0) + 1 }), {});
    const summary = `Message ${recipients.length} ${audience.label} (${Object.entries(counts)
      .map(([c, n]) => `${n} ${c}`)
      .join(", ")})${skipped.length ? `; ${skipped.length} can't be reached` : ""}`;
    return { summary, payload, preview: renderPreview(payload), approverNeeds: audience.approverNeeds };
  },

  /** Apply an edit (new subject/body text) to a pending action's payload. */
  edit(payload, changes) {
    const next = { ...payload };
    if (changes.subject !== undefined) next.subject = changes.subject;
    if (changes.body !== undefined) next.body = changes.body;
    return { payload: next, preview: renderPreview(next) };
  },
};
