/**
 * Scripted model for tests: each call returns the next scripted reply. A script entry is
 * either a reply object ({ content } or { toolCalls: [{ name, arguments }] }) or a
 * function (messages, tools) => reply, so tests can react to what the engine sent.
 */
export function createFakeModel(script, { name = "fake-model" } = {}) {
  const calls = [];
  let i = 0;
  return {
    name,
    calls,
    async chat({ messages, tools, signal }) {
      if (signal?.aborted) throw signal.reason;
      calls.push({ messages: structuredClone(messages), tools: tools?.map((t) => t.function.name) ?? [] });
      const entry = script[Math.min(i, script.length - 1)];
      i++;
      const reply = typeof entry === "function" ? await entry(messages, tools) : entry;
      return {
        content: reply.content ?? "",
        toolCalls: (reply.toolCalls ?? []).map((c, n) => ({
          id: c.id ?? `call_${i}_${n}`,
          name: c.name,
          arguments: typeof c.arguments === "string" ? c.arguments : JSON.stringify(c.arguments ?? {}),
        })),
        usage: reply.usage ?? { input: 10, output: 5 },
      };
    },
  };
}
