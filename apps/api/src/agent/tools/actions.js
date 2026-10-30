import { z } from "zod";
import { AUDIENCES } from "../../messaging/audiences.js";
import * as actions from "../actions/actions.service.js";
import { ToolError, resolveClass } from "./helpers.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

/** Run a proposal; report clear errors to the model; let the chat show the approval card. */
async function proposeFor(type, spec, ctx) {
  let action;
  try {
    action = await actions.propose(type, spec, { req: ctx.req, conversationId: ctx.conversationId, runId: ctx.runId });
  } catch (err) {
    if (err.status && err.status < 500) throw new ToolError(err.message);
    throw err;
  }
  ctx.onAction?.(actions.publicAction(action));
  return {
    action_id: action.id,
    status: "waiting_for_approval",
    summary: action.summary,
    approval: action.can_approve
      ? ctx.channel === "whatsapp"
        ? "The user can approve this with the Approve button sent under your reply."
        : "The user can approve this on the card shown in the chat."
      : "Someone with permission (e.g. the principal) must approve this; it is listed on their Approvals page.",
    note: "NOT done yet. Nothing has been sent or changed. Do not say it was sent or recorded.",
    ...(action.preview?.recipients
      ? {
          recipients: action.preview.recipients.length,
          by_channel: Object.fromEntries(
            Object.entries(action.preview.by_channel ?? {}).map(([c, n]) => [c, n.messages])
          ),
          ...(action.preview.estimated_cost ? { estimated_cost: action.preview.estimated_cost } : {}),
          cannot_reach: action.preview.skipped,
          example: action.preview.recipients[0] && {
            to: action.preview.recipients[0].name,
            channel: action.preview.recipients[0].channel,
            subject: action.preview.recipients[0].subject,
          },
        }
      : { preview: action.preview }),
  };
}

export default [
  {
    name: "draft_parent_message",
    description:
      "Prepare a message to parents for approval (nothing is sent until a person approves it). Audiences: " +
      "fee_defaulters (overdue fees), absent_on_date (date, default today), absence_streak (days in a row, default 3), " +
      "class (class_name), students (student_ids from find_students), all_parents. Templates: fee_reminder, absence_alert, " +
      "announcement (needs `message`). Leave subject/body empty to use the template; one message per parent, siblings combined. " +
      "Each parent gets it on their preferred channel (WhatsApp, SMS or email, with fallback); set `channel` only when the user asks for one.",
    permission: "messages:draft",
    input: z.object({
      audience: z.enum(AUDIENCES),
      date: isoDate.optional(),
      days: z.number().int().min(2).max(30).optional(),
      class_name: z.string().max(100).optional(),
      student_ids: z.array(z.number().int().positive()).max(500).optional(),
      template: z.enum(["fee_reminder", "absence_alert", "announcement"]).optional(),
      channel: z
        .enum(["whatsapp", "sms", "email"])
        .optional()
        .describe("Only if the user asked for a specific channel"),
      message: z.string().max(2000).optional().describe("Text for an announcement"),
      subject: z.string().max(300).optional(),
      body: z
        .string()
        .max(4000)
        .optional()
        .describe("Custom text; may use {{guardian_name}}, {{student_names}}, {{school_name}}"),
    }),
    label: () => "Drafting a message to parents",
    run: (input, ctx) => proposeFor("send_parent_messages", input, ctx),
  },
  {
    name: "prepare_attendance",
    description:
      "Prepare a class's attendance for a day (default today) for confirmation. List who is absent and who is late " +
      "by name or roll number, exactly as the user said them; everyone else in the class is marked present. " +
      "Nothing is saved until the user approves. Marking a day again corrects it. If a name is unclear the " +
      "error lists the class's students: ask the user which one they meant.",
    permission: "attendance:write",
    input: z.object({
      class_name: z.string().min(1).max(100),
      date: isoDate.optional().describe("YYYY-MM-DD, default today; never a future day"),
      absent: z.array(z.string().min(1).max(100)).max(200).optional(),
      late: z.array(z.string().min(1).max(100)).max(200).optional(),
    }),
    label: (i) => `Preparing attendance for ${i.class_name}`,
    async run({ class_name, date, absent, late }, ctx) {
      const room = await resolveClass(ctx, class_name);
      return proposeFor("mark_attendance", { classroom_id: room.id, day: date, absent, late }, ctx);
    },
  },
  {
    name: "prepare_fee_payment",
    description:
      "Prepare recording a fee payment for a student (applied to the oldest unpaid fees first). Needs approval before it is recorded.",
    permission: "fees:write",
    input: z.object({
      student_id: z.number().int().positive().describe("From find_students"),
      amount: z.number().positive(),
    }),
    label: () => "Preparing a fee payment",
    run: (input, ctx) => proposeFor("record_fee_payment", input, ctx),
  },
];
