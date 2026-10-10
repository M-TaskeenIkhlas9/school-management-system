import { useCallback, useEffect, useRef, useState } from "react";
import { assistantApi, streamMessage } from "./api.js";
import Markdown from "./Markdown.jsx";
import RunTrace from "./RunTrace.jsx";
import ActionCard from "../actions/ActionCard.jsx";
import "../actions/actions.css";
import "./assistant.css";

const SUGGESTIONS = [
  "Give me a quick overview of the school today",
  "Which parents have overdue fees?",
  "Who was absent today?",
  "Which students need attention?",
];

/** Live progress of the run in flight: one line per tool, ticked when done. */
function LiveSteps({ steps }) {
  return (
    <ul className="live-steps">
      {steps.map((s) => (
        <li key={s.key} className={s.done ? "done" : ""}>
          <span className="live-steps__icon">{s.done ? (s.status === "ok" ? "✓" : "!") : "…"}</span> {s.label}
        </li>
      ))}
    </ul>
  );
}

export default function AssistantChat() {
  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState([]);
  const [openTrace, setOpenTrace] = useState(null);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const bottomRef = useRef(null);

  const refreshConversations = useCallback(async () => {
    const list = await assistantApi.listConversations();
    setConversations(list);
    return list;
  }, []);

  const openConversation = useCallback(async (id) => {
    setError("");
    setOpenTrace(null);
    const data = await assistantApi.getConversation(id);
    setActiveId(id);
    setMessages(data.messages);
    setActions(data.actions ?? []);
  }, []);

  useEffect(() => {
    assistantApi
      .status()
      .then(setStatus)
      .catch(() => setStatus({ model: null }));
    refreshConversations().catch((err) => setError(err.message));
  }, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, liveSteps]);

  const startNew = () => {
    setActiveId(null);
    setMessages([]);
    setActions([]);
    setOpenTrace(null);
    setError("");
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || running) return;
    setInput("");
    setError("");
    setRunning(true);
    setLiveSteps([]);
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: "user", content: message }]);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      let conversationId = activeId;
      if (!conversationId) {
        conversationId = (await assistantApi.createConversation()).id;
        setActiveId(conversationId);
      }
      await streamMessage(conversationId, message, {
        signal: controller.signal,
        onEvent: (event, data) => {
          if (event === "tool_started") {
            setLiveSteps((prev) => [...prev, { key: `${prev.length}`, label: data.label, done: false }]);
          } else if (event === "tool_finished") {
            setLiveSteps((prev) => {
              const i = prev.findLastIndex((s) => !s.done && s.label === data.label);
              return prev.map((s, j) => (j === i ? { ...s, done: true, status: data.status } : s));
            });
          } else if (event === "action_proposed") {
            setActions((prev) => [...prev, data.action]);
          } else if (event === "message") {
            setMessages((prev) => [
              ...prev,
              { id: data.id, role: "assistant", content: data.content, run_id: data.run_id },
            ]);
          }
        },
      });
      refreshConversations().catch(() => {});
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setRunning(false);
      setLiveSteps([]);
      abortRef.current = null;
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this conversation?")) return;
    await assistantApi.deleteConversation(id);
    await refreshConversations();
    if (id === activeId) startNew();
  };

  const notConfigured = status && !status.model;

  return (
    <div className="assistant">
      <aside className="assistant__sidebar">
        <button type="button" className="btn primary" onClick={startNew} disabled={running}>
          + New chat
        </button>
        <ul className="assistant__conversations">
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? "active" : ""}>
              <button type="button" onClick={() => openConversation(c.id)} disabled={running} title={c.title}>
                {c.title}
              </button>
              <button
                type="button"
                className="assistant__delete"
                onClick={() => remove(c.id)}
                aria-label="Delete conversation"
              >
                ×
              </button>
            </li>
          ))}
          {!conversations.length && <li className="muted">No conversations yet</li>}
        </ul>
      </aside>

      <section className="assistant__main">
        <header className="assistant__header">
          <div>
            <h4>School Assistant</h4>
            <p className="muted">Looks things up and prepares messages or payments — nothing happens until approved.</p>
          </div>
          {status?.model && <span className="badge success">{status.model.model}</span>}
        </header>

        <div className="assistant__thread">
          {notConfigured && (
            <div className="assistant__notice">
              No AI model is configured. Ask the administrator to set <code>AI_PROVIDER</code> and an API key.
            </div>
          )}
          {!messages.length && !notConfigured && (
            <div className="assistant__empty">
              <p className="muted">Ask about your school. For example:</p>
              <div className="assistant__suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} disabled={running}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`assistant__msg assistant__msg--${m.role}`}>
              <div className="assistant__bubble">
                {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
              </div>
              {m.role === "assistant" && m.run_id && (
                <button
                  type="button"
                  className="btn link assistant__trace-toggle"
                  onClick={() => setOpenTrace(openTrace === m.run_id ? null : m.run_id)}
                >
                  {openTrace === m.run_id ? "Hide steps" : "Show steps"}
                </button>
              )}
              {m.role === "assistant" &&
                m.run_id &&
                actions.filter((a) => a.run_id === m.run_id).map((a) => <ActionCard key={a.id} action={a} />)}
              {openTrace === m.run_id && <RunTrace runId={m.run_id} />}
            </div>
          ))}
          {running && (
            <div className="assistant__msg assistant__msg--assistant">
              <div className="assistant__bubble assistant__working">
                <span>Working on it…</span>
                <LiveSteps steps={liveSteps} />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="assistant__error">{error}</div>}

        <form
          className="assistant__composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={2}
            placeholder="Ask a question (Enter to send, Shift+Enter for a new line)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={running || notConfigured}
          />
          {running ? (
            <button type="button" className="btn ghost" onClick={() => abortRef.current?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" className="btn primary" disabled={!input.trim() || notConfigured}>
              Send
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
