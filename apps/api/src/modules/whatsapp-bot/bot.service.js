/**
 * The assistant on WhatsApp. A linked staff member messages the school's number; the message is
 * saved and answered by a background job (Meta wants the webhook answered at once), with the same
 * assistant, tools and role checks as the web chat. What the assistant prepares comes back with
 * Approve / Cancel buttons, and approvers are told on WhatsApp when someone else prepares something.
 *
 * Commands (anything else goes to the assistant): HELP, NEW, PENDING, APPROVE <n>, CANCEL <n>, UNLINK.
 */
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";
import { normalizePhone } from "../../lib/phone.js";
import { enqueue } from "../../jobs/queue.js";
import { loadUserContext } from "../../middleware/auth.js";
import { getChannel } from "../../messaging/channels/index.js";
import * as store from "../../agent/store.js";
import * as actions from "../../agent/actions/actions.service.js";
import { runAgent } from "../../agent/engine/runAgent.js";
import { getModel } from "../../agent/llm/index.js";
import { school } from "../settings/school.js";
import { chunks, toWhatsApp } from "./format.js";
import { linkByCode, linkedUser, parseLinkCode, tooManyAttempts, unlink } from "./link.js";

// A WhatsApp conversation continues while the user keeps writing; after this gap a new one starts.
const SESSION_HOURS = Number(process.env.WHATSAPP_BOT_SESSION_HOURS) || 6;
// Questions to the assistant per user per 10 minutes.
const RATE_LIMIT = Number(process.env.WHATSAPP_BOT_RATE_LIMIT) || 20;
const MAX_CARDS = 5;

const HELP = `*School assistant on WhatsApp*
Ask anything you would ask the assistant in the app, for example:
- Who is absent today?
- Which parents have overdue fees?
- Send a fee reminder to class 5A's parents
- 5A attendance: all present except Ali and Sara

Messages, fee payments and attendance are only *prepared*; they happen when you tap Approve.

*PENDING* – what is waiting for your approval
*APPROVE 12* / *CANCEL 12* – decide on item 12
*NEW* – start a new conversation
*UNLINK* – stop using WhatsApp with your account`;

const record = async (row) => {
  const [res] = await pool.execute(
    `INSERT INTO staff_whatsapp_messages (user_id, direction, phone, wa_message_id, body, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.userId ?? null,
      row.direction,
      row.phone,
      row.waMessageId ?? null,
      row.body,
      row.status,
      row.error?.slice(0, 300) ?? null,
    ]
  );
  return res.insertId;
};

const setStatus = (id, status, error = null) =>
  pool.execute("UPDATE staff_whatsapp_messages SET status = ?, error = ? WHERE id = ?", [
    status,
    error?.slice(0, 300) ?? null,
    id,
  ]);

/** Send to a staff member's phone and log it. Never throws: a failed reply must not re-run the question. */
export async function sendToStaff(userId, phone, body, { buttons, template } = {}) {
  const whatsapp = getChannel("whatsapp");
  const parts = buttons?.length || template ? [body] : chunks(body);
  for (const part of parts) {
    let status;
    let error = null;
    let waMessageId = null;
    try {
      const sent = await whatsapp.send({
        to: phone,
        body: part,
        buttons,
        templateName: template?.name,
        templateParams: template?.params,
      });
      status = sent.status;
      waMessageId = sent.providerMessageId;
    } catch (err) {
      status = "failed";
      error = err.message;
      logger.warn({ err: err.message, userId }, "WhatsApp bot reply failed");
    }
    await record({ userId, direction: "out", phone, waMessageId, body: part, status, error });
  }
}

/**
 * An incoming WhatsApp message (from the webhook). Returns true when it was for the bot (a linked
 * staff member, or a link request); false lets the parents' handling (STOP / START) take it.
 */
export async function inbound(m) {
  const phone = normalizePhone(`+${m.from ?? ""}`);
  if (!phone) return false;
  const text = String(
    m.interactive?.button_reply?.id ?? m.button?.payload ?? m.text?.body ?? m.button?.text ?? ""
  ).trim();

  const user = await linkedUser(phone);
  if (user) {
    let id;
    try {
      id = await record({ userId: user.id, direction: "in", phone, waMessageId: m.id, body: text, status: "received" });
    } catch (err) {
      if (err.code === "ER_DUP_ENTRY") return true; // Meta sent the same message again
      throw err;
    }
    await enqueue("whatsapp_bot_message", { message_id: id }, { maxAttempts: 1 });
    return true;
  }

  const code = parseLinkCode(text);
  if (!code) return false;
  if (await tooManyAttempts(phone)) return true; // ignored without a reply
  const linked = await linkByCode(phone, code);
  try {
    await record({
      userId: linked?.id,
      direction: "in",
      phone,
      waMessageId: m.id,
      body: "LINK ********",
      status: linked ? "linked" : "link_failed",
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return true;
    throw err;
  }
  await sendToStaff(
    linked?.id,
    phone,
    linked
      ? `Linked to ${linked.username} (${linked.role}) at ${school().name || "the school"}.\n\n${HELP}`
      : "That code is wrong or has expired. Get a new one on *My account* in the school app."
  );
  return true;
}

// ---------- Answering ----------

/** "approve 12", "approve:12" (button), "cancel #12" → { name, id }; HELP, NEW, PENDING, UNLINK. */
export function parseCommand(text) {
  const t = String(text ?? "").trim();
  const decision = t.match(/^(approve|reject|cancel)\s*[:#]?\s*(\d+)$/i);
  if (decision) return { name: /approve/i.test(decision[1]) ? "approve" : "reject", id: Number(decision[2]) };
  const word = t.toLowerCase().replace(/[.!]+$/, "");
  if (["help", "menu", "?"].includes(word)) return { name: "help" };
  if (["new", "reset", "new chat"].includes(word)) return { name: "new" };
  if (["pending", "approvals"].includes(word)) return { name: "pending" };
  if (word === "unlink") return { name: "unlink" };
  return null;
}

async function currentConversation(userId) {
  const [[row]] = await pool.execute(
    `SELECT id FROM agent_conversations WHERE user_id = ? AND channel = 'whatsapp'
       AND updated_at > NOW() - INTERVAL ${SESSION_HOURS} HOUR ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [userId]
  );
  return row?.id ?? (await store.createConversation(userId, "New conversation", "whatsapp")).id;
}

/** The text of an approval card: what will happen, with an example message. */
export function actionText(a, heading = `*Waiting for approval #${a.id}*`) {
  const lines = [heading, a.summary];
  const p = a.preview ?? {};
  if (a.type === "send_parent_messages" && p.recipients?.[0]) {
    const r = p.recipients[0];
    lines.push("", `Example, to ${r.name} (${r.channel}):`, `"${String(r.body ?? "").slice(0, 400)}"`);
    if (p.estimated_cost) lines.push(`Estimated cost: ${p.estimated_cost}`);
  } else if (a.type === "record_fee_payment" && p.outstanding_before) {
    lines.push(`Owed before: ${p.outstanding_before}`);
  } else if (a.type === "mark_attendance") {
    if (p.absent_names?.length) lines.push(`Absent: ${p.absent_names.join(", ")}`);
    if (p.late_names?.length) lines.push(`Late: ${p.late_names.join(", ")}`);
    if (p.changes?.length) lines.push(`Changes ${p.changes.length} mark(s) already saved for that day.`);
  }
  if (a.requested_by_name) lines.push(`Prepared by ${a.requested_by_name}`);
  return lines.join("\n");
}

const decisionButtons = (id) => [
  { id: `approve:${id}`, title: "Approve" },
  { id: `reject:${id}`, title: "Cancel" },
];

async function sendCard(user, phone, action, heading) {
  if (action.can_approve) {
    await sendToStaff(user.id, phone, actionText(action, heading), { buttons: decisionButtons(action.id) });
  } else {
    await sendToStaff(
      user.id,
      phone,
      `${actionText(action, heading)}\n\nSomeone who can approve it (e.g. the principal) has been asked.`
    );
  }
}

function decidedText(a) {
  if (a.status === "rejected") return `Cancelled #${a.id}: ${a.summary}. Nothing was sent or changed.`;
  if (a.type === "send_parent_messages") {
    const queued = a.result?.queued ?? 0;
    return `Approved #${a.id}. ${queued} message${queued === 1 ? " is" : "s are"} on the way; the Outbox in the app shows each one.`;
  }
  if (a.type === "mark_attendance") return `Saved #${a.id}: ${a.summary}.`;
  return `Approved #${a.id}: ${a.summary}. Done.`;
}

async function decide(user, phone, { name, id }) {
  const req = { user };
  try {
    const a =
      name === "approve" ? await actions.approve(req, id) : await actions.reject(req, id, "Cancelled on WhatsApp");
    await sendToStaff(user.id, phone, decidedText(a));
  } catch (err) {
    if (!(err.status < 500)) throw err;
    await sendToStaff(user.id, phone, err.status === 404 ? `There is no item #${id} for you.` : err.message);
  }
}

async function pending(user, phone) {
  const waiting = (await actions.listForUser(user, { status: "pending" })).filter((a) => a.can_approve);
  if (!waiting.length) return sendToStaff(user.id, phone, "Nothing is waiting for your approval.");
  for (const a of waiting.slice(0, MAX_CARDS)) await sendCard(user, phone, a);
  if (waiting.length > MAX_CARDS) {
    await sendToStaff(user.id, phone, `…and ${waiting.length - MAX_CARDS} more on the Approvals page in the app.`);
  }
}

async function tooBusy(userId) {
  const [[row]] = await pool.execute(
    `SELECT COUNT(*) AS n FROM staff_whatsapp_messages
     WHERE user_id = ? AND direction = 'in' AND status = 'answered' AND created_at > NOW() - INTERVAL 10 MINUTE`,
    [userId]
  );
  return Number(row.n) >= RATE_LIMIT;
}

async function ask(user, phone, text) {
  const model = getModel();
  if (!model) return sendToStaff(user.id, phone, "The assistant isn't set up yet: no AI model is configured.");
  if (await tooBusy(user.id)) {
    return sendToStaff(
      user.id,
      phone,
      "That's a lot of questions in a few minutes. Please wait a little and ask again."
    );
  }
  const proposed = [];
  const { answer } = await runAgent({
    user,
    conversationId: await currentConversation(user.id),
    message: text,
    model,
    channel: "whatsapp",
    emit: (event, data) => event === "action_proposed" && proposed.push(data.action),
  });
  await sendToStaff(user.id, phone, toWhatsApp(answer));
  for (const action of proposed) await sendCard(user, phone, action);
}

/** Job: answer one saved message. */
export async function answerMessage({ message_id }) {
  const [[msg]] = await pool.execute("SELECT * FROM staff_whatsapp_messages WHERE id = ?", [message_id]);
  if (!msg || msg.status !== "received") return;
  const user = await loadUserContext(msg.user_id);
  if (!user || !user.permissions.has("assistant:use")) return setStatus(msg.id, "ignored");
  const { phone } = msg;
  try {
    const command = parseCommand(msg.body);
    if (!msg.body) {
      await sendToStaff(user.id, phone, "I can only read text messages. Type your question, or HELP.");
    } else if (command?.name === "help") {
      await sendToStaff(user.id, phone, HELP);
    } else if (command?.name === "new") {
      await store.createConversation(user.id, "New conversation", "whatsapp");
      await sendToStaff(user.id, phone, "Started a new conversation. What would you like to know?");
    } else if (command?.name === "pending") {
      await pending(user, phone);
    } else if (command?.name === "unlink") {
      await unlink({ user });
      await sendToStaff(user.id, phone, "This number is no longer linked. Link it again from My account in the app.");
    } else if (command) {
      await decide(user, phone, command);
    } else {
      await ask(user, phone, msg.body);
    }
    await setStatus(msg.id, "answered");
  } catch (err) {
    await setStatus(msg.id, "failed", err.message);
    await sendToStaff(user.id, phone, "Sorry, something went wrong answering that. Please try again.");
    throw Object.assign(err, { retryable: false });
  }
}

// ---------- Telling approvers ----------

/**
 * Job: tell approvers on WhatsApp about something waiting for them. Free-form messages (with
 * buttons) only reach someone who wrote to the bot in the last 24 hours; others get the approved
 * template `approval_request` (parameters: who prepared it, what it is, its number).
 */
export async function notifyApprovers({ action_id }) {
  const [[action]] = await pool.execute("SELECT requested_by, status FROM agent_actions WHERE id = ?", [action_id]);
  if (!action || action.status !== "pending") return;
  const [rows] = await pool.execute(
    `SELECT u.id, u.whatsapp_phone,
            (SELECT MAX(m.created_at) > NOW() - INTERVAL 23 HOUR FROM staff_whatsapp_messages m
             WHERE m.user_id = u.id AND m.direction = 'in') AS in_window
     FROM users u WHERE u.whatsapp_phone IS NOT NULL AND u.is_active = 1
       AND u.whatsapp_sv = u.session_version AND u.id <> ?`,
    [action.requested_by]
  );
  for (const row of rows) {
    const user = await loadUserContext(row.id);
    let a;
    try {
      a = await actions.getForUser(user, action_id);
    } catch {
      continue;
    }
    if (!a.can_approve) continue;
    if (Number(row.in_window)) {
      await sendCard(user, row.whatsapp_phone, a, `*${a.requested_by_name} prepared this – #${a.id}*`);
    } else {
      await sendToStaff(user.id, row.whatsapp_phone, actionText(a), {
        template: { name: "approval_request", params: [a.requested_by_name, a.summary, String(a.id)] },
      });
    }
  }
}
