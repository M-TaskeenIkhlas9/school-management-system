import { Router } from "express";
import { z } from "zod";
import validate, { idParam, requiredText } from "../middleware/validate.js";
import { createError } from "../middleware/errorHandler.js";
import { agentLimiter } from "../middleware/rateLimit.js";
import * as store from "./store.js";
import { runAgent, DEFAULT_LIMITS } from "./engine/runAgent.js";
import { describeModel, getModel } from "./llm/index.js";
import { toolsForUser } from "./tools/registry.js";
import * as actions from "./actions/actions.service.js";
import { channelModes } from "../messaging/channels/index.js";
import { optionalText } from "../middleware/validate.js";
import { hasPermission } from "../middleware/access.js";
import { usageSummary } from "./usage.js";

const router = Router();

// How the assistant is used (for people who see reports or manage users).
router.get("/usage", async (req, res) => {
  if (!hasPermission(req, "reports:read") && !hasPermission(req, "users:manage")) {
    throw createError(403, "You don't have access to AI usage", "FORBIDDEN");
  }
  res.json(await usageSummary({ days: req.query.days }));
});

router.get("/status", (req, res) => {
  res.json({
    model: getModel() ? (describeModel() ?? { model: getModel().name }) : null,
    limits: DEFAULT_LIMITS,
    tools: toolsForUser(req.user).map((t) => ({ name: t.name, description: t.description })),
    channels: channelModes(),
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
  const [messages, runs] = await Promise.all([store.recentMessages(id, 500), store.runsForConversation(id)]);
  const conversationActions = await actions.forRuns(
    req.user,
    runs.map((r) => r.id)
  );
  res.json({ conversation, messages, runs, actions: conversationActions });
});

router.delete("/conversations/:id", async (req, res) => {
  await store.deleteConversation(req.user.id, idParam(req));
  res.json({ success: true });
});

// The activity trace of one run (every model and tool step).
router.get("/runs/:id", async (req, res) => {
  res.json(await store.getRun(req.user.id, idParam(req)));
});

/**
 * Send a message and stream the run as Server-Sent Events:
 * run_started, thinking, tool_started, tool_finished, message, run_finished.
 * Closing the connection cancels the run.
 */
router.post(
  "/conversations/:id/messages",
  agentLimiter,
  validate(z.object({ message: requiredText(4000) })),
  async (req, res) => {
    const conversationId = idParam(req);
    await store.getConversation(req.user.id, conversationId);
    const model = getModel();
    if (!model)
      throw createError(503, "No AI model is configured. Set AI_PROVIDER / AI_API_KEY.", "MODEL_NOT_CONFIGURED");

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort(new Error("Client disconnected"));
    });
    const emit = (event, data) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    await runAgent({
      user: req.user,
      conversationId,
      message: req.body.message,
      model,
      emit,
      signal: controller.signal,
    });
    res.end();
  }
);

// ---------- Approval-gated actions ----------

router.get("/actions", async (req, res) => {
  const status = ["pending", "executing", "executed", "rejected", "failed", "expired"].includes(req.query.status)
    ? req.query.status
    : undefined;
  res.json(await actions.listForUser(req.user, { status }));
});

router.get("/actions/:id", async (req, res) => {
  res.json(actions.publicAction(await actions.getForUser(req.user, idParam(req))));
});

const editSchema = z.object({
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(4000).optional(),
});

router.patch("/actions/:id", validate(editSchema), async (req, res) => {
  res.json(actions.publicAction(await actions.edit(req, idParam(req), req.body)));
});

router.post("/actions/:id/approve", async (req, res) => {
  res.json(actions.publicAction(await actions.approve(req, idParam(req))));
});

router.post("/actions/:id/reject", validate(z.object({ reason: optionalText(300) })), async (req, res) => {
  res.json(actions.publicAction(await actions.reject(req, idParam(req), req.body.reason)));
});

export default router;
