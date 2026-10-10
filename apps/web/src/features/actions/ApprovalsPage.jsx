import { useCallback, useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import ActionCard from "./ActionCard.jsx";
import { actionsApi } from "./api.js";
import "./actions.css";

const FILTERS = [
  ["pending", "Waiting"],
  ["executing", "Sending"],
  ["executed", "Done"],
  ["rejected", "Rejected"],
  ["failed", "Failed"],
  ["expired", "Expired"],
  ["", "All"],
];

export default function ApprovalsPage() {
  const [status, setStatus] = useState("pending");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    actionsApi
      .list(status)
      .then(setItems)
      .catch((err) => setError(err.message));
  }, [status]);
  useEffect(load, [load]);

  return (
    <section className="section active">
      <PageHeader title="Approvals" subtitle="Messages and payments the assistant prepared wait here until approved.">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="approvals__filter">
          {FILTERS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </PageHeader>
      {error && <div className="card empty-card">{error}</div>}
      {items && !items.length && <div className="card empty-card">Nothing here.</div>}
      <div className="approvals__list">
        {items?.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
      </div>
    </section>
  );
}
