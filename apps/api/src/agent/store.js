import pool from "../db/pool.js";
import { createError } from "../middleware/errorHandler.js";

const json = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

// ---------- Conversations (always scoped to their owner) ----------

export async function listConversations(userId) {
  const [rows] = await pool.execute(
    "SELECT id, title, created_at, updated_at FROM agent_conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 50",
    [userId]
  );
  return rows;
}

export async function createConversation(userId, title = "New conversation") {
  const [res] = await pool.execute("INSERT INTO agent_conversations (user_id, title) VALUES (?, ?)", [
    userId,
    title.slice(0, 200),
  ]);
  return getConversation(userId, res.insertId);
}

export async function getConversation(userId, id) {
  const [[row]] = await pool.execute(
    "SELECT id, title, created_at, updated_at FROM agent_conversations WHERE id = ? AND user_id = ?",
    [id, userId]
  );
  if (!row) throw createError(404, "Conversation not found", "NOT_FOUND");
  return row;
}

export async function deleteConversation(userId, id) {
  await getConversation(userId, id);
  await pool.execute("DELETE FROM agent_conversations WHERE id = ?", [id]);
}

export async function renameIfNew(id, text) {
  await pool.execute("UPDATE agent_conversations SET title = ? WHERE id = ? AND title = 'New conversation'", [
    text.replace(/\s+/g, " ").slice(0, 60),
    id,
  ]);
}

// ---------- Messages ----------

export async function addMessage(conversationId, role, content, runId = null) {
  const [res] = await pool.execute(
    "INSERT INTO agent_messages (conversation_id, role, content, run_id) VALUES (?, ?, ?, ?)",
    [conversationId, role, content, runId]
  );
  await pool.execute("UPDATE agent_conversations SET updated_at = NOW() WHERE id = ?", [conversationId]);
  return { id: res.insertId, conversation_id: conversationId, role, content, run_id: runId };
}

/** The most recent `limit` messages, oldest first. */
export async function recentMessages(conversationId, limit = 20) {
  const [rows] = await pool.query(
    "SELECT * FROM (SELECT * FROM agent_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?) t ORDER BY id",
    [conversationId, limit]
  );
  return rows;
}

// ---------- Runs and steps ----------

export async function createRun(conversationId, userId, model) {
  const [res] = await pool.execute("INSERT INTO agent_runs (conversation_id, user_id, model) VALUES (?, ?, ?)", [
    conversationId,
    userId,
    model,
  ]);
  return res.insertId;
}

export async function addStep(runId, step) {
  await pool.execute(
    `INSERT INTO agent_run_steps (run_id, seq, type, tool_name, input, output, status, error, duration_ms, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      runId,
      step.seq,
      step.type,
      step.toolName ?? null,
      json(step.input),
      json(step.output),
      step.status ?? "ok",
      step.error ?? null,
      step.durationMs ?? null,
      step.inputTokens ?? null,
      step.outputTokens ?? null,
    ]
  );
}

export async function finishRun(runId, { status, stepCount, inputTokens, outputTokens, error = null }) {
  await pool.execute(
    `UPDATE agent_runs SET status = ?, step_count = ?, input_tokens = ?, output_tokens = ?, error = ?, finished_at = NOW()
     WHERE id = ?`,
    [status, stepCount, inputTokens, outputTokens, error, runId]
  );
}

export async function getRun(userId, runId) {
  const [[run]] = await pool.execute("SELECT * FROM agent_runs WHERE id = ? AND user_id = ?", [runId, userId]);
  if (!run) throw createError(404, "Run not found", "NOT_FOUND");
  const [steps] = await pool.execute("SELECT * FROM agent_run_steps WHERE run_id = ? ORDER BY seq", [runId]);
  return { ...run, steps };
}

export async function runsForConversation(conversationId) {
  const [rows] = await pool.execute(
    `SELECT id, status, model, step_count, input_tokens, output_tokens, started_at, finished_at
     FROM agent_runs WHERE conversation_id = ? ORDER BY id`,
    [conversationId]
  );
  return rows;
}
