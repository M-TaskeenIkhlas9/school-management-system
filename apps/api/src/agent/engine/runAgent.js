/**
 * The agent loop: one user message → one run.
 *
 *   model → (tool calls → checked → executed → results back to model)* → final answer
 *
 * Limits: steps, wall-clock time and tokens. Every model call and tool call is saved
 * as a step. Progress is reported through `emit(event, data)` for live streaming.
 */
import logger from "../../lib/logger.js";
import * as store from "../store.js";
import { getTool, modelSpec, toolsForUser, ToolError } from "../tools/registry.js";
import { systemPrompt } from "../context/prompt.js";
import { shrink } from "../context/shrink.js";
import * as classroomService from "../../modules/classrooms/classrooms.service.js";

export const DEFAULT_LIMITS = {
  maxSteps: Number(process.env.AGENT_MAX_STEPS) || 8,
  timeoutMs: Number(process.env.AGENT_TIMEOUT_MS) || 60_000,
  maxTokens: Number(process.env.AGENT_MAX_TOKENS) || 60_000,
};

const HISTORY_MESSAGES = 20;

/** Run one tool call safely; never throws. Returns { status, forModel, output, error }. */
async function executeToolCall(call, ctx) {
  const tool = getTool(call.name);
  if (!tool) {
    return {
      status: "error",
      error: `Unknown tool "${call.name}"`,
      forModel: { error: `There is no tool named "${call.name}".` },
    };
  }
  if (!ctx.user.permissions.has(tool.permission)) {
    return {
      status: "denied",
      error: `Missing permission ${tool.permission}`,
      forModel: { error: "Access denied: this user's role does not allow that information." },
    };
  }
  let args;
  try {
    args = JSON.parse(call.arguments || "{}");
  } catch {
    return {
      status: "error",
      error: "Invalid JSON arguments",
      forModel: { error: "The arguments were not valid JSON." },
    };
  }
  const parsed = tool.input.safeParse(args);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return { status: "error", input: args, error: issues, forModel: { error: `Invalid arguments: ${issues}` } };
  }
  try {
    const data = shrink(await tool.run(parsed.data, ctx));
    return { status: "ok", input: parsed.data, output: data, forModel: { data } };
  } catch (err) {
    if (err instanceof ToolError) {
      return { status: "error", input: parsed.data, error: err.message, forModel: { error: err.message } };
    }
    logger.error({ err, tool: tool.name }, "Agent tool failed");
    return {
      status: "error",
      input: parsed.data,
      error: err.message,
      forModel: { error: "The tool failed unexpectedly." },
    };
  }
}

function friendlyModelError(err) {
  const status = err?.status;
  if (status === 401 || status === 403)
    return "The AI service rejected our API key. Ask the administrator to check the AI settings.";
  if (status === 404) return "The configured AI model is not available. Ask the administrator to check AI_MODEL.";
  if (status === 429)
    return "The AI service is busy or its usage limit was reached. Please try again in a little while.";
  return "I couldn't reach the AI service just now. Please try again.";
}

/**
 * @param {{ user, conversationId, message, model, emit?, signal?, limits?, channel? }} options
 * @returns {Promise<{ runId, status, answer }>}
 */
export async function runAgent({
  user,
  conversationId,
  message,
  model,
  emit = () => {},
  signal,
  limits = {},
  channel = "web",
}) {
  const { maxSteps, timeoutMs, maxTokens } = { ...DEFAULT_LIMITS, ...limits };
  const userMessage = await store.addMessage(conversationId, "user", message);
  await store.renameIfNew(conversationId, message);
  const runId = await store.createRun(conversationId, user.id, model.name);
  emit("run_started", { run_id: runId, user_message_id: userMessage.id });

  const tools = toolsForUser(user);
  const classNames =
    user.classIds === null ? [] : (await classroomService.getAll({ classIds: user.classIds })).map((c) => c.name);
  const history = await store.recentMessages(conversationId, HISTORY_MESSAGES);
  const messages = [
    { role: "system", content: systemPrompt({ user, tools, classNames, channel }) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  const ctx = {
    user,
    req: { user },
    conversationId,
    runId,
    channel,
    onAction: (action) => emit("action_proposed", { action }),
  };
  const runSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean));

  let seq = 0;
  let modelCalls = 0;
  const tokens = { input: 0, output: 0 };
  let status = "completed";
  let answer = null;
  let errorText = null;

  try {
    while (answer === null) {
      if (modelCalls >= maxSteps) {
        status = "limit_reached";
        answer = `I stopped after ${maxSteps} steps without a complete answer. Try asking a narrower question.`;
        break;
      }
      if (tokens.input + tokens.output > maxTokens) {
        status = "limit_reached";
        answer = "I stopped because this request used too much of the AI budget. Try asking a narrower question.";
        break;
      }

      emit("thinking", { step: modelCalls + 1 });
      const started = Date.now();
      const reply = await model.chat({ messages, tools: tools.map(modelSpec), signal: runSignal });
      modelCalls++;
      tokens.input += reply.usage.input;
      tokens.output += reply.usage.output;
      await store.addStep(runId, {
        seq: ++seq,
        type: "model",
        output: { content: reply.content || null, tool_calls: reply.toolCalls.map((c) => c.name) },
        durationMs: Date.now() - started,
        inputTokens: reply.usage.input,
        outputTokens: reply.usage.output,
      });

      if (!reply.toolCalls.length) {
        answer = reply.content?.trim() || "I don't have an answer for that.";
        break;
      }

      messages.push({
        role: "assistant",
        content: reply.content || null,
        tool_calls: reply.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: c.arguments },
        })),
      });
      for (const call of reply.toolCalls) {
        const tool = getTool(call.name);
        let label = `Using ${call.name}`;
        try {
          if (tool?.label) label = tool.label(JSON.parse(call.arguments || "{}"));
        } catch {
          /* keep the generic label */
        }
        emit("tool_started", { tool: call.name, label });
        const toolStarted = Date.now();
        const result = await executeToolCall(call, ctx);
        const durationMs = Date.now() - toolStarted;
        await store.addStep(runId, {
          seq: ++seq,
          type: "tool",
          toolName: call.name,
          input: result.input ?? call.arguments,
          output: result.output,
          status: result.status,
          error: result.error,
          durationMs,
        });
        emit("tool_finished", { tool: call.name, label, status: result.status, duration_ms: durationMs });
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.forModel) });
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      status = "cancelled";
      answer = "Cancelled.";
    } else if (err?.name === "TimeoutError" || runSignal.aborted) {
      status = "limit_reached";
      answer = "That took too long, so I stopped. Try a narrower question.";
    } else {
      status = "failed";
      // Node puts the real network reason (DNS, reset, TLS…) in err.cause.
      errorText = [err?.message ?? String(err), err?.cause?.code, err?.cause?.message].filter(Boolean).join(" | ");
      answer = friendlyModelError(err);
      logger.warn({ err: errorText, runId }, "Agent run failed");
    }
  }

  const assistantMessage = await store.addMessage(conversationId, "assistant", answer, runId);
  await store.finishRun(runId, {
    status,
    stepCount: seq,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    error: errorText,
  });
  emit("message", { id: assistantMessage.id, content: answer, run_id: runId });
  emit("run_finished", { run_id: runId, status, steps: seq, input_tokens: tokens.input, output_tokens: tokens.output });
  return { runId, status, answer };
}
