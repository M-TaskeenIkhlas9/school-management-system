import { Router } from "express";
import { z } from "zod";
import validate, { idParam, requiredText } from "../middleware/validate.js";
import { createError } from "../middleware/errorHandler.js";
import { agentLimiter } from "../middleware/rateLimit.js";
import * as store from "./store.js";
import { runAgent, DEFAULT_LIMITS } from "./engine/runAgent.js";
import { describeModel, getModel } from "./llm/index.js";
import { toolsForUser } from "./tools/registry.js";

const router = Router();

router.get("/status", (req, res) => {
  res.json({
    model: getModel() ? (describeModel() ?? { model: getModel().name }) : null,
    limits: DEFAULT_LIMITS,
    tools: toolsForUser(req.user).map((t) => ({ name: t.name, description: t.description })),
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
  res.json({ conversation, messages, runs });
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

export default router;
