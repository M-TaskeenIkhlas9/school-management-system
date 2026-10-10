import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { agentApi } from "./api.js";
import ActionCard from "./ActionCard.jsx";
import Markdown from "./Markdown.jsx";
import "./agent.css";

const SUGGESTIONS = [
  "Email the parents whose fees are due",
  "Who needs attention this week?",
  "Email parents of students absent 3 days in a row",
  "Give me a quick summary of the school today",
];

export default function AgentChat({ initialInput = "" }) {
  const [status, setStatus] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState([]);
  const [input, setInput] = useState(initialInput);
  const [sending, setSending] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [busyActionId, setBusyActionId] = useState(null);
  const [error, setError] = useState("");
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  const loadConversation = useCallback(async (id) => {
    setLoadingThread(true);
    setError("");
    try {
      const data = await agentApi.getConversation(id);
      setActiveId(id);
      setMessages(data.messages);
      setActions(data.actions);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const refreshConversations = useCallback(async () => {
    const list = await agentApi.listConversations();
    setConversations(list);
    return list;
  }, []);

  useEffect(() => {
    agentApi
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
    refreshConversations()
      // A pre-filled request (e.g. "Send Reminders") starts a fresh chat; otherwise resume the latest one.
      .then((list) => !initialInput && list[0] && loadConversation(list[0].id))
      .catch((err) => setError(err.message));
  }, [refreshConversations, loadConversation, initialInput]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, actions, sending]);

  const startNewChat = () => {
    setActiveId(null);
    setMessages([]);
    setActions([]);
    setError("");
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || sending) return;
    setInput("");
    setError("");
    setSending(true);
    setMessages((prev) => [...prev, { id: `tmp-${Date.now()}`, role: "user", content: message }]);
    try {
      let conversationId = activeId;
      if (!conversationId) {
        const conv = await agentApi.createConversation();
        conversationId = conv.id;
        setActiveId(conv.id);
      }
      const turn = await agentApi.sendMessage(conversationId, message);
      setMessages((prev) => [
        ...prev.filter((m) => !String(m.id).startsWith("tmp-")),
        turn.userMessage,
        turn.assistantMessage,
      ]);
      setActions((prev) => [...prev, ...turn.actions]);
      refreshConversations().catch(() => {});
    } catch (err) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => !String(m.id).startsWith("tmp-")));
      setInput(message);
    } finally {
      setSending(false);
    }
  };

  const decide = async (actionId, decision) => {
    setBusyActionId(actionId);
    setError("");
    try {
      if (decision === "approve") {
        await agentApi.approve(actionId);
        queryClient.invalidateQueries(); // an approved action may have changed students, fees, exams…
      } else {
        await agentApi.reject(actionId);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyActionId(null);
      if (activeId) await loadConversation(activeId);
    }
  };

  const removeConversation = async (id) => {
    if (!window.confirm("Delete this conversation? Pending actions in it can no longer be approved.")) return;
    try {
      await agentApi.deleteConversation(id);
      const list = await refreshConversations();
      if (id === activeId) {
        if (list[0]) loadConversation(list[0].id);
        else startNewChat();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  // Attach each action card under the assistant message that proposed it.
  const { actionsByMessage, orphanActions } = useMemo(() => {
    const byId = new Map(actions.map((a) => [a.id, a]));
    const attached = new Set();
    const map = new Map();
    for (const m of messages) {
      const ids = m.metadata?.action_ids || [];
      const list = ids.map((id) => byId.get(id)).filter(Boolean);
      list.forEach((a) => attached.add(a.id));
      if (list.length) map.set(m.id, list);
    }
    return { actionsByMessage: map, orphanActions: actions.filter((a) => !attached.has(a.id)) };
  }, [messages, actions]);

  const renderAction = (a) => <ActionCard key={a.id} action={a} busy={busyActionId === a.id} onDecide={decide} />;

  return (
    <div className="agent-chat">
      <aside className="agent-sidebar">
        <button type="button" className="btn primary agent-new" onClick={startNewChat}>
          + New chat
        </button>
        <ul className="agent-conv-list">
          {conversations.map((c) => (
            <li key={c.id} className={c.id === activeId ? "active" : ""}>
              <button type="button" className="agent-conv" onClick={() => loadConversation(c.id)} title={c.title}>
                {c.title}
              </button>
              <button
                type="button"
                className="agent-conv-delete"
                onClick={() => removeConversation(c.id)}
                aria-label="Delete conversation"
              >
                ×
              </button>
            </li>
          ))}
          {conversations.length === 0 && <li className="muted agent-conv-empty">No conversations yet</li>}
        </ul>
      </aside>

      <section className="agent-main">
        <header className="agent-header">
          <div>
            <h4>School Assistant</h4>
            <p className="muted">Asks before it acts: emails and changes need your approval.</p>
          </div>
          <div className="agent-status">
            <span className={`badge ${status?.model ? "success" : "warning"}`}>
              {status?.model ? `AI: ${status.model.split(":").slice(1).join(":")}` : "AI: rule-based only"}
            </span>
            <span className={`badge ${status?.email_mode === "smtp" ? "success" : "warning"}`}>
              {status?.email_mode === "smtp" ? "Email: live" : "Email: simulated"}
            </span>
          </div>
        </header>

        <div className="agent-thread">
          {loadingThread && <p className="muted">Loading…</p>}
          {!loadingThread && messages.length === 0 && (
            <div className="agent-empty">
              <p>Tell me what you need. For example:</p>
              <div className="agent-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="agent-chip" onClick={() => send(s)} disabled={sending}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`agent-msg ${m.role} ${m.metadata?.kind === "action_result" ? "result" : ""}`}>
              <div className="agent-bubble">{m.role === "assistant" ? <Markdown text={m.content} /> : m.content}</div>
              {actionsByMessage.get(m.id)?.map(renderAction)}
            </div>
          ))}
          {orphanActions.map(renderAction)}
          {sending && (
            <div className="agent-msg assistant">
              <div className="agent-bubble agent-typing">Working on it…</div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {error && <div className="agent-error">{error}</div>}

        <form
          className="agent-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            rows={2}
            placeholder='e.g. "Email the parents whose fees are due"  (Enter to send, Shift+Enter for a new line)'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={sending}
          />
          <button type="submit" className="btn primary" disabled={sending || !input.trim()}>
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
