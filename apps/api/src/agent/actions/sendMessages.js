/** Action type: message a group of parents (approval required before anything is sent). */
import { createError } from "../../middleware/errorHandler.js";
import { formatMoney, resolveAudience, withFeeVars } from "../../messaging/audiences.js";
import { buildRecipients } from "../../messaging/recipients.js";
import { getTemplate, renderTemplate } from "../../messaging/templates.js";
import { availableChannels, channelModes, getChannel } from "../../messaging/channels/index.js";
import { toPlainText } from "../../messaging/channels/text.js";
import { school } from "../../modules/settings/school.js";

const MAX_RECIPIENTS = Number(process.env.MESSAGE_MAX_RECIPIENTS) || 500;
const CHANNEL_LABEL = { email: "email", sms: "SMS", whatsapp: "WhatsApp" };

/**
 * Exactly what one parent receives on one channel. Email gets the subject and full text; SMS the
 * short text when the template has one; WhatsApp an approved template with its parameters
 * (or the plain text once the message was edited, since edits can't change an approved template).
 * Parents who chose Urdu get the template's Urdu text (and the Urdu translation of the WhatsApp
 * template); text the school wrote or edited goes to everyone exactly as written.
 */
export function renderForChannel(payload, recipient, channel) {
  const urdu = recipient.language === "ur" && Boolean(payload.ur);
  const text = urdu ? payload.ur : payload;
  const vars = {
    ...recipient.vars,
    school_name: school().name || "the school",
    message: payload.message ?? "",
  };
  const language = urdu ? "ur" : "en";
  if (channel === "email") {
    return {
      language,
      subject: renderTemplate(text.subject, vars),
      body: renderTemplate(text.body, vars),
      template_name: null,
      template_params: null,
      template_language: null,
      segments: null,
      est_cost: 0,
    };
  }
  const body = toPlainText(renderTemplate(channel === "sms" ? text.sms_body || text.body : text.body, vars));
  const template = channel === "whatsapp" && payload.whatsapp_template;
  const param = (key) => String((urdu ? vars[`${key}_ur`] : undefined) ?? vars[key] ?? "");
  const { segments, cost } = getChannel(channel).estimate(body);
  return {
    language,
    subject: null,
    body,
    template_name: template || null,
    template_params: template
      ? String(payload.whatsapp_params || "")
          .split(",")
          .filter(Boolean)
          .map((key) => param(key.trim()))
      : null,
    template_language: template && urdu ? "ur" : null,
    segments,
    est_cost: cost,
  };
}

/** Render every recipient's message, plus the cost estimate, from the stored payload. */
export function renderPreview(payload) {
  const recipients = payload.recipients.map((r) => ({
    guardian_id: r.guardian_id,
    name: r.name,
    channel: r.channel,
    to: r.to,
    student_names: r.student_names,
    ...renderForChannel(payload, r, r.channel),
  }));
  const inUrdu = recipients.filter((r) => r.language === "ur").length;

  const byChannel = {};
  for (const r of recipients) {
    const c = (byChannel[r.channel] ??= { messages: 0, segments: 0, cost: 0 });
    c.messages += 1;
    c.segments += r.segments ?? 0;
    c.cost += r.est_cost ?? 0;
  }
  const total = Object.values(byChannel).reduce((sum, c) => sum + c.cost, 0);
  const notes = [];
  if (byChannel.whatsapp && !payload.whatsapp_template) {
    notes.push(
      "WhatsApp messages go as plain text, which only reaches parents who messaged the school in the last 24 hours; others fall back to the next channel."
    );
  }
  if (inUrdu) notes.push(`${inUrdu} parent(s) get this message in Urdu.`);
  if (!payload.ur && payload.recipients.some((r) => r.language === "ur")) {
    notes.push("This text was written for this message, so parents who chose Urdu get it exactly as written.");
  }
  if (byChannel.sms && recipients.some((r) => r.segments > 1)) {
    notes.push("Some SMS are longer than one message and will be billed as several.");
  }

  return {
    audience: payload.audience_label,
    subject_template: payload.subject,
    body_template: payload.body,
    channel_modes: channelModes(),
    by_channel: byChannel,
    estimated_cost: total > 0 ? formatMoney(total) : null,
    notes,
    recipients,
    skipped: payload.skipped,
  };
}

export const sendMessages = {
  type: "send_parent_messages",
  approvePermission: "messages:send",

  /**
   * @param spec { audience, date?, days?, class_name?, student_ids?, template?, message?, subject?, body?, channel? }
   * @returns {{ summary, payload, preview, approverNeeds }} or throws when nobody can be reached.
   */
  async propose(spec, req) {
    if (spec.channel && !availableChannels().includes(spec.channel)) {
      throw createError(
        400,
        `${CHANNEL_LABEL[spec.channel] ?? spec.channel} is not set up for this school (available: ${availableChannels()
          .map((c) => CHANNEL_LABEL[c])
          .join(", ")}).`,
        "CHANNEL_UNAVAILABLE"
      );
    }
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
    if (templateKey === "absence_alert" && !spec.audience.startsWith("absen")) {
      throw createError(
        400,
        "An absence alert needs an absence audience (absent_on_date or absence_streak) so it can say when.",
        "VALIDATION_ERROR"
      );
    }

    // A fee reminder to a class or chosen students: use each student's real balance; skip those who owe nothing.
    let students = audience.students;
    const notOwing = [];
    if (templateKey === "fee_reminder" && spec.audience !== "fee_defaulters") {
      const fees = await withFeeVars(req, students);
      students = fees.students;
      notOwing.push(...fees.skipped);
      audience.approverNeeds = [...new Set([...audience.approverNeeds, "fees:read"])];
      if (!students.length) {
        throw createError(400, `None of ${audience.label} have overdue fees.`, "EMPTY_AUDIENCE");
      }
    }

    const built = await buildRecipients(students, { channel: spec.channel });
    const recipients = built.recipients;
    const skipped = [...notOwing, ...built.skipped];
    if (!recipients.length) {
      throw createError(
        400,
        `${audience.students.length} student(s) match, but no guardian can be reached${spec.channel ? ` by ${CHANNEL_LABEL[spec.channel]}` : ""}: ${skipped.map((s) => `${s.student} (${s.reason})`).join("; ")}`,
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

    const custom = Boolean(spec.subject || spec.body);
    const payload = {
      audience: spec.audience,
      audience_label: audience.label,
      template: templateKey,
      channel: spec.channel ?? null,
      subject: spec.subject || template.subject,
      body: spec.body || template.body,
      // Custom text replaces the template, so the short SMS text and WhatsApp template no longer match it.
      sms_body: custom ? null : template.sms_body,
      whatsapp_template: custom ? null : template.whatsapp_template,
      whatsapp_params: custom ? null : template.whatsapp_params,
      // The Urdu version, for parents who chose Urdu (none for text written for this message).
      ur:
        custom || !template.body_ur
          ? null
          : {
              subject: template.subject_ur || template.subject,
              body: template.body_ur,
              sms_body: template.sms_body_ur,
            },
      message: spec.message ?? null,
      recipients,
      skipped,
    };
    const preview = renderPreview(payload);
    const counts = Object.entries(preview.by_channel)
      .map(([c, n]) => `${n.messages} ${CHANNEL_LABEL[c]}`)
      .join(", ");
    const summary = `Message ${recipients.length} ${audience.label} (${counts})${skipped.length ? `; ${skipped.length} can't be reached` : ""}`;
    return { summary, payload, preview, approverNeeds: audience.approverNeeds };
  },

  /** Apply an edit (new subject/body text) to a pending action's payload. */
  edit(payload, changes) {
    const next = { ...payload };
    if (changes.subject !== undefined && changes.subject !== payload.subject) {
      next.subject = changes.subject;
      next.ur = null; // the edited text goes to every parent as written
    }
    if (changes.body !== undefined && changes.body !== payload.body) {
      next.body = changes.body;
      // The approved text is now the edited text on every channel and in every language.
      next.sms_body = null;
      next.whatsapp_template = null;
      next.whatsapp_params = null;
      next.ur = null;
    }
    return { payload: next, preview: renderPreview(next) };
  },
};
