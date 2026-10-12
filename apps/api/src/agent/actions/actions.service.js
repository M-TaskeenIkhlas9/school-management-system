/**
 * Approval-gated actions. Lifecycle:
 *   pending ──approve──▶ executing ──(all deliveries settled)──▶ executed | failed
 *      │                    (records run inside the approval transaction)
 *      ├──reject──▶ rejected          pending past expires_at ──▶ expired
 * What runs is exactly the stored payload (recipients fixed at proposal; text editable while pending).
 */
import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";
import { classScope } from "../../middleware/access.js";
import { audit } from "../../lib/audit.js";
import { enqueue, queueNow } from "../../jobs/queue.js";
import { nextSendTime } from "../../messaging/quietHours.js";
import { renderPreview, sendMessages } from "./sendMessages.js";
import { feePayment } from "./feePayment.js";

const TYPES = { [sendMessages.type]: sendMessages, [feePayment.type]: feePayment };
const TTL_HOURS = Number(process.env.AGENT_ACTION_TTL_HOURS) || 72;
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

function hydrate(row) {
  if (!row) return null;
  return { ...row, payload: parse(row.payload), preview: parse(row.preview), result: parse(row.result) };
}

/** Public shape (no raw payload). */
export function publicAction(a) {
  const { payload: _payload, ...rest } = a;
  return rest;
}

function canApprove(user, action) {
  const needs = [action.approve_permission, ...(action.payload?.approver_needs ?? [])];
  return needs.every((p) => user.permissions.has(p));
}

async function expireOld() {
  await pool.execute("UPDATE agent_actions SET status = 'expired' WHERE status = 'pending' AND expires_at < NOW()");
}

export async function propose(type, spec, { req, conversationId = null, runId = null }) {
  const handler = TYPES[type];
  if (!handler) throw createError(400, `Unknown action type ${type}`, "VALIDATION_ERROR");
  const { summary, payload, preview, approverNeeds } = await handler.propose(spec, req);
  const [res] = await pool.execute(
    `INSERT INTO agent_actions (conversation_id, run_id, requested_by, type, approve_permission, summary, payload, preview, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL ${TTL_HOURS} HOUR)`,
    [
      conversationId,
      runId,
      req.user.id,
      type,
      handler.approvePermission,
      summary.slice(0, 500),
      JSON.stringify({ ...payload, approver_needs: approverNeeds }),
      JSON.stringify(preview),
    ]
  );
  await audit(req, "action.propose", { entityType: "agent_action", entityId: res.insertId, details: { type } });
  return getForUser(req.user, res.insertId);
}

/** An action the user may see: their own, or one they could approve. Adds can_approve/can_edit. */
export async function getForUser(user, id) {
  await expireOld();
  const [[row]] = await pool.execute(
    `SELECT a.*, u.username AS requested_by_name, d.username AS decided_by_name,
            (SELECT COUNT(*) FROM message_deliveries md WHERE md.action_id = a.id) AS delivery_count
     FROM agent_actions a JOIN users u ON u.id = a.requested_by LEFT JOIN users d ON d.id = a.decided_by
     WHERE a.id = ?`,
    [id]
  );
  const action = hydrate(row);
  if (!action) throw createError(404, "Action not found", "NOT_FOUND");
  const approver = canApprove(user, action);
  if (action.requested_by !== user.id && !approver) throw createError(404, "Action not found", "NOT_FOUND");
  return {
    ...action,
    can_approve: approver && action.status === "pending",
    can_edit:
      action.status === "pending" && action.type === sendMessages.type && (approver || action.requested_by === user.id),
  };
}

/** Pending actions this user can approve, plus their own recent ones. */
export async function listForUser(user, { status } = {}) {
  await expireOld();
  const [rows] = await pool.query(
    `SELECT a.*, u.username AS requested_by_name FROM agent_actions a JOIN users u ON u.id = a.requested_by
     ${status ? "WHERE a.status = ?" : ""} ORDER BY a.id DESC LIMIT 200`,
    status ? [status] : []
  );
  return rows
    .map(hydrate)
    .filter((a) => a.requested_by === user.id || canApprove(user, a))
    .map((a) => publicAction({ ...a, can_approve: canApprove(user, a) && a.status === "pending" }));
}

export async function forRuns(user, runIds) {
  if (!runIds.length) return [];
  const [rows] = await pool.query("SELECT id FROM agent_actions WHERE run_id IN (?) ORDER BY id", [runIds]);
  const out = [];
  for (const { id } of rows) out.push(publicAction(await getForUser(user, id)));
  return out;
}

export async function edit(req, id, changes) {
  const action = await getForUser(req.user, id);
  if (!action.can_edit) throw createError(409, "This action can no longer be edited", "NOT_EDITABLE");
  const { payload, preview } = TYPES[action.type].edit(action.payload, changes);
  await pool.execute(
    "UPDATE agent_actions SET payload = ?, preview = ?, edited = 1 WHERE id = ? AND status = 'pending'",
    [JSON.stringify(payload), JSON.stringify(preview), id]
  );
  await audit(req, "action.edit", { entityType: "agent_action", entityId: id });
  return getForUser(req.user, id);
}

/** Claim a pending action atomically (a double click cannot run it twice). */
async function claim(conn, user, action, nextStatus) {
  const [res] = await conn.execute(
    "UPDATE agent_actions SET status = ?, decided_by = ?, decided_at = NOW() WHERE id = ? AND status = 'pending' AND expires_at > NOW()",
    [nextStatus, user.id, action.id]
  );
  if (res.affectedRows !== 1)
    throw createError(409, `This action is already ${action.status}`, "ACTION_ALREADY_DECIDED");
}

export async function reject(req, id, reason = null) {
  const action = await getForUser(req.user, id);
  if (!action.can_approve && action.requested_by !== req.user.id) {
    throw createError(403, "You cannot decide on this action", "FORBIDDEN");
  }
  if (action.status !== "pending")
    throw createError(409, `This action is already ${action.status}`, "ACTION_ALREADY_DECIDED");
  await claim(pool, req.user, action, "rejected");
  if (reason) await pool.execute("UPDATE agent_actions SET result = ? WHERE id = ?", [JSON.stringify({ reason }), id]);
  await audit(req, "action.reject", { entityType: "agent_action", entityId: id, details: reason ? { reason } : null });
  return getForUser(req.user, id);
}

/** One outbox row for a rendered recipient (see renderForChannel). */
export async function insertDelivery(conn, actionId, r, sendAfter, fallbackFrom = null) {
  const [res] = await conn.execute(
    `INSERT INTO message_deliveries (action_id, guardian_id, channel, to_address, to_name, subject, body, template_name,
       template_params, segments, est_cost, student_names, send_after, fallback_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      actionId,
      r.guardian_id,
      r.channel,
      r.to,
      r.name,
      r.subject,
      r.body,
      r.template_name,
      r.template_params ? JSON.stringify(r.template_params) : null,
      r.segments,
      r.est_cost,
      r.student_names,
      sendAfter,
      fallbackFrom,
    ]
  );
  return res.insertId;
}

export async function approve(req, id) {
  const action = await getForUser(req.user, id);
  if (action.status !== "pending")
    throw createError(409, `This action is already ${action.status}`, "ACTION_ALREADY_DECIDED");
  if (!action.can_approve) throw createError(403, "You don't have permission to approve this", "FORBIDDEN");

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    if (action.type === sendMessages.type) {
      await claim(conn, req.user, action, "executing");
      const sendAfter = queueNow(nextSendTime(new Date()));
      const preview = renderPreview(action.payload); // render exactly what was approved
      for (const r of preview.recipients) {
        const id = await insertDelivery(conn, action.id, r, sendAfter);
        await enqueue("deliver_message", { delivery_id: id }, { runAt: sendAfter, conn });
      }
      await conn.execute("UPDATE agent_actions SET result = ? WHERE id = ?", [
        JSON.stringify({ queued: preview.recipients.length, send_after: sendAfter }),
        action.id,
      ]);
    } else {
      await claim(conn, req.user, action, "executed");
      const result = await TYPES[action.type].execute(action.payload, conn);
      await conn.execute("UPDATE agent_actions SET result = ? WHERE id = ?", [JSON.stringify(result), action.id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  await audit(req, "action.approve", { entityType: "agent_action", entityId: id, details: { type: action.type } });
  return getForUser(req.user, id);
}

/** After a delivery settles: mark the action executed/failed once nothing is left to send. */
export async function settleMessageAction(actionId) {
  const [[c]] = await pool.execute(
    `SELECT SUM(status IN ('queued','sending')) AS pending,
            SUM(status IN ('sent','delivered','read','simulated')) AS ok,
            SUM(status = 'failed') AS failed
     FROM message_deliveries WHERE action_id = ?`,
    [actionId]
  );
  if (Number(c.pending) > 0) return;
  // Counts are refreshed on later receipts too (e.g. a "sent" SMS reported undelivered, then a fallback).
  await pool.execute(
    `UPDATE agent_actions SET status = IF(status = 'executing', ?, status),
       result = JSON_SET(COALESCE(result, JSON_OBJECT()), '$.delivered', ?, '$.failed', ?)
     WHERE id = ? AND status IN ('executing', 'executed', 'failed')`,
    [Number(c.ok) > 0 ? "executed" : "failed", Number(c.ok), Number(c.failed), actionId]
  );
}

export { classScope };
