/**
 * Automations: rules that prepare a message to parents on a schedule (or, for "daily_briefing", send
 * the person who made it their morning briefing on WhatsApp). A run acts as the person who
 * made the rule, with their current permissions, so a rule can never reach further than they can.
 * "approve" rules leave the message waiting on Approvals; "auto" rules approve it at once, which
 * needs the creator to be allowed to send (and to see the data it is about).
 */
import pool from "../../db/pool.js";
import logger from "../../lib/logger.js";
import { createError } from "../../middleware/errorHandler.js";
import { loadUserContext } from "../../middleware/auth.js";
import { schoolToday } from "../../config/env.js";
import * as actions from "../../agent/actions/actions.service.js";
import { describeSchedule, nextRun } from "./schedule.js";
import { sendBriefing } from "../whatsapp-bot/bot.service.js";

export const KINDS = {
  fee_reminder: {
    label: "Fee reminder",
    needs: "fees:read",
    spec: () => ({ audience: "fee_defaulters", template: "fee_reminder" }),
  },
  absence_today: {
    label: "Absence alert (today)",
    needs: "attendance:read",
    spec: () => ({ audience: "absent_on_date", date: schoolToday(), template: "absence_alert" }),
  },
  absence_streak: {
    label: "Absence streak alert",
    needs: "attendance:read",
    spec: (options) => ({ audience: "absence_streak", days: options?.days || 3, template: "absence_alert" }),
  },
  // Goes only to the rule's creator, so there is nothing to approve.
  daily_briefing: {
    label: "Morning briefing",
    needs: "dashboard:read",
    toCreator: true,
  },
};

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

function hydrate(row) {
  if (!row) return null;
  const schedule = parse(row.schedule);
  return {
    ...row,
    schedule,
    options: parse(row.options) ?? {},
    is_active: Boolean(row.is_active),
    schedule_text: describeSchedule(schedule),
    kind_label: KINDS[row.kind]?.label ?? row.kind,
  };
}

const canManageAll = (user) => user.permissions.has("messages:send");

function assertAllowed(user, { kind, mode }) {
  const needs = KINDS[kind]?.needs;
  if (needs && !user.permissions.has(needs)) {
    throw createError(403, `You can't automate ${KINDS[kind].label.toLowerCase()}s`, "FORBIDDEN");
  }
  if (mode === "auto" && !KINDS[kind]?.toCreator && !user.permissions.has("messages:send")) {
    throw createError(403, "Only someone who can approve messages can let a rule send by itself", "FORBIDDEN");
  }
}

export async function list(user) {
  const [rows] = await pool.query(
    `SELECT a.*, u.username AS created_by_name,
            (SELECT r.status FROM automation_runs r WHERE r.automation_id = a.id ORDER BY r.id DESC LIMIT 1) AS last_status
     FROM automations a JOIN users u ON u.id = a.created_by
     ${canManageAll(user) ? "" : "WHERE a.created_by = ?"}
     ORDER BY a.is_active DESC, a.next_run_at IS NULL, a.next_run_at`,
    canManageAll(user) ? [] : [user.id]
  );
  return rows.map(hydrate);
}

export async function get(user, id) {
  const [[row]] = await pool.execute(
    "SELECT a.*, u.username AS created_by_name FROM automations a JOIN users u ON u.id = a.created_by WHERE a.id = ?",
    [id]
  );
  if (!row || (!canManageAll(user) && row.created_by !== user.id)) {
    throw createError(404, "Automation not found", "NOT_FOUND");
  }
  return hydrate(row);
}

export async function create(user, input) {
  const data = KINDS[input.kind]?.toCreator ? { ...input, mode: "auto" } : input; // nothing to approve
  assertAllowed(user, data);
  const next = nextRun(data.schedule);
  const [res] = await pool.execute(
    `INSERT INTO automations (name, kind, schedule, options, mode, created_by, next_run_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [data.name, data.kind, JSON.stringify(data.schedule), JSON.stringify(data.options ?? {}), data.mode, user.id, next]
  );
  return get(user, res.insertId);
}

export async function update(user, id, changes) {
  const current = await get(user, id);
  const merged = { ...current, ...changes, schedule: changes.schedule ?? current.schedule };
  assertAllowed(user, merged);
  const active = changes.is_active ?? current.is_active;
  await pool.execute(
    `UPDATE automations SET name = ?, schedule = ?, options = ?, mode = ?, is_active = ?, next_run_at = ?
     WHERE id = ?`,
    [
      merged.name,
      JSON.stringify(merged.schedule),
      JSON.stringify(changes.options ?? current.options),
      merged.mode,
      active ? 1 : 0,
      active ? nextRun(merged.schedule) : null,
      id,
    ]
  );
  return get(user, id);
}

export async function remove(user, id) {
  await get(user, id);
  await pool.execute("DELETE FROM automations WHERE id = ?", [id]);
}

export async function runs(user, id) {
  await get(user, id);
  const [rows] = await pool.execute(
    "SELECT id, trigger_type, status, action_id, recipients, note, created_at FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT 20",
    [id]
  );
  return rows;
}

/** Prepare (and for trusted rules, approve) one run. Never throws: the outcome is recorded. */
export async function runAutomation(automation, trigger = "schedule") {
  const record = async (status, { actionId = null, recipients = 0, note = null } = {}) => {
    await pool.execute(
      "INSERT INTO automation_runs (automation_id, trigger_type, status, action_id, recipients, note) VALUES (?, ?, ?, ?, ?, ?)",
      [automation.id, trigger, status, actionId, recipients, note?.slice(0, 500) ?? null]
    );
    await pool.execute("UPDATE automations SET last_run_at = NOW() WHERE id = ?", [automation.id]);
    return { status, action_id: actionId, recipients, note };
  };

  const user = await loadUserContext(automation.created_by);
  if (!user) return record("failed", { note: "The person who made this rule can no longer sign in." });
  const req = { user, ip: null };

  if (KINDS[automation.kind].toCreator) {
    try {
      const { sent, note } = await sendBriefing(user);
      return record(sent ? "sent" : "skipped", { recipients: sent ? 1 : 0, note });
    } catch (err) {
      logger.error({ err, automationId: automation.id }, "Briefing failed");
      return record("failed", { note: err.message });
    }
  }

  let action;
  try {
    const spec = {
      ...KINDS[automation.kind].spec(automation.options),
      ...(automation.options?.channel ? { channel: automation.options.channel } : {}),
    };
    action = await actions.propose("send_parent_messages", spec, { req });
  } catch (err) {
    if (err.status && err.status < 500) return record("skipped", { note: err.message });
    logger.error({ err, automationId: automation.id }, "Automation run failed");
    return record("failed", { note: err.message });
  }

  const recipients = action.preview?.recipients?.length ?? 0;
  if (automation.mode === "auto") {
    try {
      await actions.approve(req, action.id);
      return record("sent", { actionId: action.id, recipients, note: action.summary });
    } catch (err) {
      return record("waiting", {
        actionId: action.id,
        recipients,
        note: `Could not approve automatically (${err.message}); waiting for approval.`,
      });
    }
  }
  return record("waiting", { actionId: action.id, recipients, note: action.summary });
}

export async function runNow(user, id) {
  const automation = await get(user, id);
  return runAutomation(automation, "manual");
}

/**
 * Run every rule that is due. Each rule is claimed by moving its next run forward inside a locked
 * transaction first, so two servers (or a slow run) can never send the same reminder twice.
 */
export async function runDueAutomations(now = new Date()) {
  const conn = await pool.getConnection();
  let due = [];
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT * FROM automations WHERE is_active = 1 AND next_run_at IS NOT NULL AND next_run_at <= ? FOR UPDATE SKIP LOCKED",
      [now]
    );
    for (const row of rows) {
      const schedule = parse(row.schedule);
      await conn.execute("UPDATE automations SET next_run_at = ? WHERE id = ?", [nextRun(schedule, now), row.id]);
    }
    await conn.commit();
    due = rows.map(hydrate);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const results = [];
  for (const automation of due) results.push(await runAutomation(automation, "schedule"));
  return results;
}

/** Check for due rules every minute (AUTOMATIONS_POLL_MS). */
export function startAutomationClock({ intervalMs = Number(process.env.AUTOMATIONS_POLL_MS) || 60_000 } = {}) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    try {
      const ran = await runDueAutomations();
      if (ran.length) logger.info({ count: ran.length }, "Automations ran");
    } catch (err) {
      logger.error({ err }, "Automation clock error");
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, 5_000);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
