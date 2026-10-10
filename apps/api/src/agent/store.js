import pool from "../db/pool.js";
import { createError } from "../middleware/errorHandler.js";

/** Pending actions older than this can no longer be approved. */
export const ACTION_TTL_HOURS = 24;

const parseJson = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value; // mysql2 already parses JSON columns
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

// ---------- Conversations ----------

export async function listConversations(userId) {
  const [rows] = await pool.execute(
    "SELECT id, title, created_at, updated_at FROM agent_conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 50",
    [userId]
  );
  return rows;
}

export async function createConversation(userId, title = "New conversation") {
  const [result] = await pool.execute("INSERT INTO agent_conversations (user_id, title) VALUES (?, ?)", [
    userId,
    title.slice(0, 200),
  ]);
  return getConversation(userId, result.insertId);
}

export async function getConversation(userId, conversationId) {
  const [rows] = await pool.execute(
    "SELECT id, title, created_at, updated_at FROM agent_conversations WHERE id = ? AND user_id = ?",
    [conversationId, userId]
  );
  if (!rows[0]) throw createError(404, "Conversation not found", "NOT_FOUND");
  return rows[0];
}

export async function renameConversation(userId, conversationId, title) {
  await pool.execute("UPDATE agent_conversations SET title = ? WHERE id = ? AND user_id = ?", [
    title.slice(0, 200),
    conversationId,
    userId,
  ]);
}

export async function touchConversation(conversationId) {
  await pool.execute("UPDATE agent_conversations SET updated_at = NOW() WHERE id = ?", [conversationId]);
}

export async function deleteConversation(userId, conversationId) {
  await getConversation(userId, conversationId);
  await pool.execute("DELETE FROM agent_conversations WHERE id = ? AND user_id = ?", [conversationId, userId]);
}

// ---------- Messages ----------

export async function addMessage(conversationId, role, content, metadata = null) {
  const [result] = await pool.execute(
    "INSERT INTO agent_messages (conversation_id, role, content, metadata) VALUES (?, ?, ?, ?)",
    [conversationId, role, content, metadata ? JSON.stringify(metadata) : null]
  );
  await touchConversation(conversationId);
  const [rows] = await pool.execute("SELECT * FROM agent_messages WHERE id = ?", [result.insertId]);
  return { ...rows[0], metadata: parseJson(rows[0].metadata) };
}

export async function listMessages(conversationId, limit = 200) {
  const [rows] = await pool.query(
    "SELECT * FROM (SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?) t ORDER BY id ASC",
    [conversationId, limit]
  );
  return rows.map((r) => ({ ...r, metadata: parseJson(r.metadata) }));
}

// ---------- Actions ----------

function hydrateAction(row) {
  if (!row) return null;
  return {
    ...row,
    payload: parseJson(row.payload),
    preview: parseJson(row.preview),
    result: parseJson(row.result),
  };
}

export async function createAction({ conversationId, userId, type, summary, payload, preview }) {
  const [result] = await pool.execute(
    `INSERT INTO agent_actions (conversation_id, user_id, type, summary, payload, preview)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      conversationId || null,
      userId,
      type,
      summary.slice(0, 500),
      JSON.stringify(payload),
      JSON.stringify(preview ?? null),
    ]
  );
  return getAction(userId, result.insertId);
}

export async function getAction(userId, actionId) {
  const [rows] = await pool.execute("SELECT * FROM agent_actions WHERE id = ? AND user_id = ?", [actionId, userId]);
  return hydrateAction(rows[0]);
}

export async function listActionsForConversation(userId, conversationId) {
  const [rows] = await pool.execute(
    "SELECT * FROM agent_actions WHERE conversation_id = ? AND user_id = ? ORDER BY id ASC",
    [conversationId, userId]
  );
  return rows.map(hydrateAction);
}

/**
 * Atomically move a pending, unexpired action to `nextStatus`.
 * Returns the claimed action, or throws 404/409 explaining why it can't be claimed.
 * The conditional UPDATE guarantees a double-click can never execute twice.
 */
export async function claimPendingAction(userId, actionId, nextStatus) {
  const [result] = await pool.execute(
    `UPDATE agent_actions SET status = ?, decided_at = NOW()
     WHERE id = ? AND user_id = ? AND status = 'pending'
       AND created_at > NOW() - INTERVAL ${ACTION_TTL_HOURS} HOUR`,
    [nextStatus, actionId, userId]
  );
  if (result.affectedRows === 1) return getAction(userId, actionId);

  const action = await getAction(userId, actionId);
  if (!action) throw createError(404, "Action not found", "NOT_FOUND");
  if (action.status === "pending") {
    await pool.execute("UPDATE agent_actions SET status = 'expired' WHERE id = ?", [actionId]);
    throw createError(
      409,
      `This action expired (older than ${ACTION_TTL_HOURS}h). Ask the assistant again.`,
      "ACTION_EXPIRED"
    );
  }
  throw createError(409, `This action is already ${action.status}`, "ACTION_ALREADY_DECIDED");
}

export async function finishAction(actionId, { status, result = null, error = null }) {
  await pool.execute("UPDATE agent_actions SET status = ?, result = ?, error = ?, executed_at = NOW() WHERE id = ?", [
    status,
    result ? JSON.stringify(result) : null,
    error,
    actionId,
  ]);
}
