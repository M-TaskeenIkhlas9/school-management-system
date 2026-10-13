import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import ActionCard from "./ActionCard.jsx";
import { actionsApi } from "./api.js";
import "./actions.css";

const FILTERS = [
  ["pending", "Waiting"],
  ["executing", "Sending"],
  ["executed", "Done"],
  ["rejected", "Rejected"],
  ["failed", "Failed"],
  ["", "All"],
];

const EMPTY_TEXT = {
  pending: "Nothing is waiting. Ask the assistant to prepare a message or payment and it will appear here.",
  executing: "Nothing is being sent right now.",
  executed: "Approved items will be listed here.",
  rejected: "Nothing has been rejected.",
  failed: "Nothing has failed.",
  "": "Messages and payments the assistant prepares will be listed here.",
};

export default function ApprovalsPage() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    actionsApi
      .list("")
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const count = (s) => (items ?? []).filter((a) => !s || a.status === s).length;
  const shown = (items ?? []).filter((a) => !status || a.status === status);

  return (
    <section className="section">
      <PageHeader
        icon="approvals"
        tone="blue"
        title="Approvals"
        subtitle="Messages and payments the assistant prepared wait here until someone approves them."
      />

      <StatRow>
        <StatCard tone="amber" icon="bell" label="Waiting" note="need a decision">
          <CountUp value={count("pending")} />
        </StatCard>
        <StatCard tone="green" icon="approvals" label="Done" note="approved and carried out">
          <CountUp value={count("executed")} />
        </StatCard>
        <StatCard tone="rose" icon="close" label="Rejected or failed">
          <CountUp value={count("rejected") + count("failed")} />
        </StatCard>
      </StatRow>

      <Segmented
        label="Show"
        options={FILTERS.map(([key, label]) => [key, label, count(key)])}
        value={status}
        onChange={setStatus}
      />

      {error && <div className="card empty-card">{error}</div>}
      {items && !shown.length && (
        <div className="card">
          <EmptyState icon="approvals" title="Nothing here">
            {EMPTY_TEXT[status]}
          </EmptyState>
        </div>
      )}
      <div className="approvals__list">
        {shown.map((a) => (
          <ActionCard key={a.id} action={a} onChange={() => setTimeout(load, 1800)} />
        ))}
      </div>
    </section>
  );
}
