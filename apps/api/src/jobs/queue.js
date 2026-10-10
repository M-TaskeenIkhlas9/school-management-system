/**
 * Background jobs stored in MySQL. Workers claim due jobs with FOR UPDATE SKIP LOCKED, so
 * several workers never run the same job. Failed jobs retry with increasing delays; jobs
 * stuck in "running" (worker crashed) are put back in the queue.
 */
import pool from "../db/pool.js";
import logger from "../lib/logger.js";

const handlers = new Map();
const BACKOFF_SECONDS = [30, 120, 600, 1800, 3600];
const STUCK_AFTER_SECONDS = 10 * 60;

/**
 * One clock for the queue: JavaScript time truncated to whole seconds. DATETIME columns store
 * whole seconds (and round), and the database server's NOW() may use another time zone, so the
 * two are never mixed.
 */
export const queueNow = (date = new Date()) => new Date(Math.floor(date.getTime() / 1000) * 1000);
const secondsFrom = (date, seconds) => new Date(date.getTime() + seconds * 1000);

export function registerJobHandler(type, handler) {
  handlers.set(type, handler);
}

/** Queue a job (optionally inside an existing transaction `conn`). */
export async function enqueue(type, payload, { runAt = new Date(), maxAttempts = 5, conn = pool } = {}) {
  const [res] = await conn.execute("INSERT INTO jobs (type, payload, run_at, max_attempts) VALUES (?, ?, ?, ?)", [
    type,
    JSON.stringify(payload),
    queueNow(runAt),
    maxAttempts,
  ]);
  return res.insertId;
}

async function claimDue(limit, now) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      `SELECT id, type, payload, attempts, max_attempts FROM jobs
       WHERE status = 'queued' AND run_at <= ? ORDER BY run_at, id LIMIT ? FOR UPDATE SKIP LOCKED`,
      [now, limit]
    );
    if (rows.length) {
      await conn.query("UPDATE jobs SET status = 'running', locked_at = ?, attempts = attempts + 1 WHERE id IN (?)", [
        now,
        rows.map((r) => r.id),
      ]);
    }
    await conn.commit();
    return rows.map((r) => ({ ...r, attempts: r.attempts + 1 }));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Run every due job once. Returns how many ran. Safe to call concurrently. */
export async function processDueJobs({ limit = 20 } = {}) {
  const now = queueNow();
  await pool.execute("UPDATE jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < ?", [
    secondsFrom(now, -STUCK_AFTER_SECONDS),
  ]);
  const jobs = await claimDue(limit, now);
  for (const job of jobs) {
    const handler = handlers.get(job.type);
    const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload;
    try {
      if (!handler) throw Object.assign(new Error(`No handler for job type ${job.type}`), { retryable: false });
      await handler(payload, job);
      await pool.execute("UPDATE jobs SET status = 'done', locked_at = NULL, last_error = NULL WHERE id = ?", [job.id]);
    } catch (err) {
      const retry = err.retryable !== false && job.attempts < job.max_attempts;
      const delay = BACKOFF_SECONDS[Math.min(job.attempts - 1, BACKOFF_SECONDS.length - 1)];
      await pool.execute("UPDATE jobs SET status = ?, locked_at = NULL, last_error = ?, run_at = ? WHERE id = ?", [
        retry ? "queued" : "failed",
        err.message,
        retry ? secondsFrom(now, delay) : now,
        job.id,
      ]);
      logger.warn({ jobId: job.id, type: job.type, attempt: job.attempts, retry, err: err.message }, "Job failed");
    }
  }
  return jobs.length;
}

/** Poll for due jobs every `intervalMs` until stopped. */
export function startWorker({ intervalMs = Number(process.env.JOBS_POLL_MS) || 3000 } = {}) {
  let stopped = false;
  let timer = null;
  const tick = async () => {
    try {
      while (!stopped && (await processDueJobs()) > 0);
    } catch (err) {
      logger.error({ err }, "Job worker error");
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, 0);
  logger.info(`Job worker started (every ${intervalMs}ms)`);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
