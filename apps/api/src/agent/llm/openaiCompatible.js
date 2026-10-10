/**
 * Chat-completions client for any OpenAI-compatible API (OpenAI, Groq, Ollama, OpenRouter…).
 * Speaks plain HTTP so there is no SDK to keep in step with the providers.
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    });
  });

export class ModelError extends Error {
  constructor(message, { status, code, retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = "ModelError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

/** How long the provider asked us to wait: Retry-After header, or "try again in 2.9s" in the message. */
export function retryAfterMs(headers, message) {
  const header = Number(headers?.get?.("retry-after"));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const match = /try again in ([\d.]+)\s*(ms|s)/i.exec(message || "");
  if (match) return Number(match[1]) * (match[2].toLowerCase() === "ms" ? 1 : 1000);
  return null;
}

export function createOpenAICompatibleModel({
  baseUrl,
  apiKey,
  model,
  timeoutMs = 45_000,
  maxRetries = 3,
  maxRetryWaitMs = 15_000,
  temperature = 0.2,
}) {
  async function once({ messages, tools, signal }) {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)].filter(Boolean)),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = body?.error?.message || `Model request failed (${res.status})`;
      throw new ModelError(message, {
        status: res.status,
        code: body?.error?.code,
        retryable: RETRYABLE.has(res.status),
        retryAfterMs: retryAfterMs(res.headers, message),
      });
    }
    const msg = body.choices?.[0]?.message ?? {};
    return {
      content: msg.content ?? "",
      toolCalls: (msg.tool_calls ?? []).map((c) => ({
        id: c.id,
        name: c.function?.name,
        arguments: c.function?.arguments ?? "{}",
      })),
      usage: { input: body.usage?.prompt_tokens ?? 0, output: body.usage?.completion_tokens ?? 0 },
    };
  }

  return {
    name: model,
    async chat(request) {
      for (let attempt = 0; ; attempt++) {
        try {
          return await once(request);
        } catch (err) {
          if (request.signal?.aborted) throw err;
          const retryable =
            err instanceof ModelError ? err.retryable : err.name === "TimeoutError" || err.name === "TypeError";
          if (!retryable || attempt >= maxRetries) throw err;
          // Honour the provider's requested wait (rate limits), otherwise back off exponentially.
          const wait = err.retryAfterMs ? err.retryAfterMs + 250 : 500 * 2 ** attempt;
          if (wait > maxRetryWaitMs) throw err;
          await sleep(wait, request.signal);
        }
      }
    },
  };
}
