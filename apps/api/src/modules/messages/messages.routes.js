import { Router } from "express";
import { z } from "zod";
import pool from "../../db/pool.js";
import { parseQuery } from "../../middleware/validate.js";
import { hasPermission } from "../../middleware/access.js";
import { pageParams, pageResult, pageWindow, whereClause } from "../../lib/pagination.js";

const router = Router();

const query = z.object({
  ...pageParams,
  status: z.enum(["queued", "sending", "sent", "delivered", "read", "failed", "simulated"]).optional(),
  channel: z.enum(["email", "sms", "whatsapp"]).optional(),
  action_id: z.coerce.number().int().positive().optional(),
});

// The outbox. Senders see every delivery; others only those of actions they requested.
router.get("/deliveries", async (req, res) => {
  const q = parseQuery(query, req.query);
  const where = whereClause([
    ["d.status = ?", q.status],
    ["d.channel = ?", q.channel],
    ["d.action_id = ?", q.action_id],
    ["a.requested_by = ?", hasPermission(req, "messages:send") ? null : req.user.id],
  ]);
  const from = "FROM message_deliveries d JOIN agent_actions a ON a.id = d.action_id";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from} ${where.sql}`, where.params);
  const { limit, offset } = pageWindow(q);
  const [rows] = await pool.query(
    `SELECT d.id, d.action_id, d.channel, d.to_name, d.to_address, d.student_names, d.subject, d.status, d.provider,
            d.error, d.attempts, d.send_after, d.sent_at, d.created_at, a.summary AS action_summary
     ${from} ${where.sql} ORDER BY d.id DESC LIMIT ? OFFSET ?`,
    [...where.params, limit, offset]
  );
  res.json(pageResult(rows, total, q));
});

export default router;
