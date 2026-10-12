import { useEffect, useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";
import { actionsApi } from "./api.js";
import { displayDateTime } from "../../lib/format.js";

const STATUS_TONE = {
  queued: "warning",
  sending: "info",
  simulated: "info",
  sent: "success",
  delivered: "success",
  read: "success",
  failed: "danger",
  cancelled: "neutral",
};
const when = (value) => displayDateTime(value);

export default function OutboxPage() {
  const [filters, setFilters] = useState({ status: "", channel: "", page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, pageSize: 25 }).filter(([, v]) => v !== ""));
    setError("");
    actionsApi
      .deliveries(params)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  const setFilter = (name) => (e) => setFilters((f) => ({ ...f, [name]: e.target.value, page: 1 }));

  return (
    <section className="section">
      <PageHeader title="Outbox" subtitle="Every message to parents: waiting, sent or failed." />
      <div className="card table-card">
        <div className="filters">
          <select value={filters.status} onChange={setFilter("status")} aria-label="Status">
            <option value="">Any status</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select value={filters.channel} onChange={setFilter("channel")} aria-label="Channel">
            <option value="">Any channel</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        {error && <p className="muted">{error}</p>}
        <table>
          <thead>
            <tr>
              <th>To</th>
              <th>Students</th>
              <th>Channel</th>
              <th>Subject</th>
              <th>Status</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.length === 0 && (
              <tr>
                <td colSpan="6">No messages yet.</td>
              </tr>
            )}
            {data?.items.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.to_name}
                  <div className="muted">{d.to_address}</div>
                </td>
                <td>{d.student_names}</td>
                <td>{d.channel}</td>
                <td>{d.subject || "—"}</td>
                <td>
                  <span className={`badge ${STATUS_TONE[d.status] ?? "neutral"}`}>{d.status}</span>
                  {d.error && <div className="muted">{d.error}</div>}
                </td>
                <td>{when(d.sent_at || d.send_after || d.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={data} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
