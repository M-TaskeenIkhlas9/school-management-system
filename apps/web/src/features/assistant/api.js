// Assistant endpoints. Sending a message streams Server-Sent Events over fetch
// (EventSource cannot send our Authorization header).
import { api, ApiError, session, SESSION_EXPIRED_EVENT } from "../../api/client.js";

export const assistantApi = {
  status: () => api.get("/assistant/status"),
  listConversations: () => api.get("/assistant/conversations"),
  createConversation: () => api.post("/assistant/conversations"),
  getConversation: (id) => api.get(`/assistant/conversations/${id}`),
  deleteConversation: (id) => api.del(`/assistant/conversations/${id}`),
  getRun: (id) => api.get(`/assistant/runs/${id}`),
};

/** Parse complete "event: …\ndata: …" blocks from a buffer; returns [events, rest]. */
export function parseSseChunk(buffer) {
  const events = [];
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop();
  for (const block of blocks) {
    const event = /^event: (.*)$/m.exec(block)?.[1];
    const data = /^data: (.*)$/m.exec(block)?.[1];
    if (event && data) events.push({ event, data: JSON.parse(data) });
  }
  return [events, rest];
}

/** Send a message; calls onEvent(event, data) for each streamed event. Abort with `signal`. */
export async function streamMessage(conversationId, message, { onEvent, signal }) {
  const token = localStorage.getItem("authToken");
  const res = await fetch(`/api/assistant/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
    signal,
  });
  if (res.status === 401) {
    session.clear();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `Request failed (${res.status})`, res.status, body.code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const [events, rest] = parseSseChunk(buffer);
    buffer = rest;
    for (const { event, data } of events) onEvent(event, data);
  }
}
