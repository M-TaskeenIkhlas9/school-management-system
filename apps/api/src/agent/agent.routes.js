import { Router } from "express";
import pool from "../db/pool.js";
import validate from "../middleware/validate.js";
import { createError } from "../middleware/errorHandler.js";
import * as store from "./store.js";
import * as actions from "./actions.js";
import { runTurn, resolveModel } from "./harness.js";
import { emailMode } from "../lib/email.js";

const router = Router();

const idParam = (req, name = "id") => {
  const id = Number(req.params[name]);
  if (!Number.isInteger(id) || id <= 0) throw createError(400, `Invalid ${name}`, "VALIDATION_ERROR");
  return id;
};

// What the assistant can do right now (shown in the chat header).
router.get("/status", (_req, res) => {
  res.json({
    model: resolveModel(),
    email_mode: emailMode(),
    email_redirect_to: process.env.EMAIL_REDIRECT_TO || null,
  });
});

router.get("/conversations", async (req, res, next) => {
  try {
    res.json(await store.listConversations(req.user.id));
  } catch (err) { next(err); }
});

router.post("/conversations", async (req, res, next) => {
  try {
    res.status(201).json(await store.createConversation(req.user.id));
  } catch (err) { next(err); }
});

router.get("/conversations/:id", async (req, res, next) => {
  try {
    const id = idParam(req);
    const conversation = await store.getConversation(req.user.id, id);
    const [messages, conversationActions] = await Promise.all([
      store.listMessages(id),
      store.listActionsForConversation(req.user.id, id),
    ]);
    res.json({ conversation, messages, actions: conversationActions });
  } catch (err) { next(err); }
});

router.delete("/conversations/:id", async (req, res, next) => {
  try {
    await store.deleteConversation(req.user.id, idParam(req));
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post(
  "/conversations/:id/messages",
  validate({ message: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const message = req.body.message.trim();
      if (!message) throw createError(400, "message is required", "VALIDATION_ERROR");
      if (message.length > 4000) throw createError(400, "message is too long (max 4000 characters)", "VALIDATION_ERROR");
      res.json(await runTurn({ userId: req.user.id, conversationId: idParam(req), message }));
    } catch (err) { next(err); }
  }
);

router.post("/actions/:id/approve", async (req, res, next) => {
  try {
    res.json(await actions.approveAction(req.user.id, idParam(req)));
  } catch (err) { next(err); }
});

router.post("/actions/:id/reject", async (req, res, next) => {
  try {
    res.json(await actions.rejectAction(req.user.id, idParam(req)));
  } catch (err) { next(err); }
});

// Audit trail of emails sent (or simulated) by approved actions.
router.get("/outbox", async (req, res, next) => {
  try {
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
  } catch (err) { next(err); }
});

export default router;
