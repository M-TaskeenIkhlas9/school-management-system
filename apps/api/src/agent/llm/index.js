import { createOpenAICompatibleModel } from "./openaiCompatible.js";

const PROVIDERS = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", keyEnv: "GROQ_API_KEY" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", keyEnv: "OPENAI_API_KEY" },
  ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3.2", keyEnv: null },
};

/**
 * Model settings from the environment. AI_PROVIDER picks a preset (groq, openai, ollama);
 * AI_MODEL / AI_BASE_URL / AI_API_KEY override it (any OpenAI-compatible service works).
 * Returns null when no model is configured.
 */
export function modelConfig(env = process.env) {
  const provider = env.AI_PROVIDER || (env.GROQ_API_KEY ? "groq" : env.OPENAI_API_KEY ? "openai" : null);
  if (!provider) return null;
  const preset = PROVIDERS[provider] ?? {};
  const baseUrl = env.AI_BASE_URL || preset.baseUrl;
  const apiKey = env.AI_API_KEY || (preset.keyEnv ? env[preset.keyEnv] : undefined);
  const model = env.AI_MODEL || preset.model;
  if (!baseUrl || !model || (provider !== "ollama" && !apiKey)) return null;
  return { provider, baseUrl, apiKey, model, fallbackModel: env.AI_FALLBACK_MODEL || null };
}

/** The configured model, with an optional fallback model tried when the main one fails. */
export function createModel(config = modelConfig()) {
  if (!config) return null;
  const primary = createOpenAICompatibleModel(config);
  if (!config.fallbackModel) return primary;
  const fallback = createOpenAICompatibleModel({ ...config, model: config.fallbackModel });
  return {
    name: primary.name,
    async chat(request) {
      try {
        return await primary.chat(request);
      } catch (err) {
        if (request.signal?.aborted) throw err;
        return { ...(await fallback.chat(request)), model: fallback.name };
      }
    },
  };
}

/** Public description of the model (no secrets) for the status endpoint. */
export function describeModel(config = modelConfig()) {
  return config ? { provider: config.provider, model: config.model, fallback_model: config.fallbackModel } : null;
}

// The model used by the API. Created lazily from the environment; tests swap in a fake.
let current;
export function getModel() {
  if (current === undefined) current = createModel();
  return current;
}
export function setModel(model) {
  current = model;
}
