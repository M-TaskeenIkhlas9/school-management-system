import { Router } from "express";
import { z } from "zod";
import pool from "../db/pool.js";
import validate, { idParam, requiredText } from "../middleware/validate.js";
import { emailMode } from "../lib/email.js";
import { agentLimiter } from "../middleware/rateLimit.js";
import * as store from "./store.js";
import * as actions from "./actions.js";
import { runTurn, resolveModel } from "./harness.js";

const messageSchema = z.object({ message: requiredText(4000) });

const router = Router();

// What the assistant can do right now (shown in the chat header).
router.get("/status", (_req, res) => {
  res.json({
    model: resolveModel(),
    email_mode: emailMode(),
    email_redirect_to: process.env.EMAIL_REDIRECT_TO || null,
  });
});

router.get("/conversations", async (req, res) => {
  res.json(await store.listConversations(req.user.id));
});

router.post("/conversations", async (req, res) => {
  res.status(201).json(await store.createConversation(req.user.id));
});

router.get("/conversations/:id", async (req, res) => {
  const id = idParam(req);
  const conversation = await store.getConversation(req.user.id, id);
  const [messages, conversationActions] = await Promise.all([
    store.listMessages(id),
    store.listActionsForConversation(req.user.id, id),
  ]);
  res.json({ conversation, messages, actions: conversationActions });
});

router.delete("/conversations/:id", async (req, res) => {
  await store.deleteConversation(req.user.id, idParam(req));
  res.json({ success: true });
});

router.post("/conversations/:id/messages", agentLimiter, validate(messageSchema), async (req, res) => {
  res.json(await runTurn({ userId: req.user.id, conversationId: idParam(req), message: req.body.message }));
});

router.post("/actions/:id/approve", async (req, res) => {
  res.json(await actions.approveAction(req.user.id, idParam(req)));
});

router.post("/actions/:id/reject", async (req, res) => {
  res.json(await actions.rejectAction(req.user.id, idParam(req)));
});

// Audit trail of emails sent (or simulated) by approved actions.
router.get("/outbox", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const [rows] = await pool.query(
    `SELECT o.id, o.action_id, o.student_id, o.to_email, o.to_name, o.subject, o.status, o.error, o.created_at
     FROM email_outbox o
     JOIN agent_actions a ON a.id = o.action_id
     WHERE a.user_id = ?
     ORDER BY o.id DESC LIMIT ?`,
    [req.user.id, limit]
  );
  res.json(rows);
});

export default router;
