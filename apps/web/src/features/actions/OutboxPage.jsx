import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";
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
};
const CHANNEL = {
  whatsapp: ["WhatsApp", "message"],
  sms: ["SMS", "message"],
  email: ["Email", "outbox"],
};

/** Totals per status, from the same API (one small request each). */
function useStatusTotals() {
  return useQuery({
    queryKey: ["deliveries", "totals"],
    queryFn: async () => {
      const total = async (status) =>
        (await actionsApi.deliveries({ pageSize: 1, ...(status ? { status } : {}) })).total;
      const [all, sent, delivered, read, simulated, queued, failed] = await Promise.all(
        ["", "sent", "delivered", "read", "simulated", "queued", "failed"].map(total)
      );
      return { all, arrived: sent + delivered + read, simulated, queued, failed };
    },
  });
}

export default function OutboxPage() {
  const [filters, setFilters] = useState({ status: "", channel: "", page: 1 });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const { data: totals } = useStatusTotals();

  useEffect(() => {
    const params = Object.fromEntries(Object.entries({ ...filters, pageSize: 25 }).filter(([, v]) => v !== ""));
    setError("");
    actionsApi
      .deliveries(params)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [filters]);

  const set = (name) => (value) => setFilters((f) => ({ ...f, [name]: value, page: 1 }));

  return (
    <section className="section">
      <PageHeader
        icon="outbox"
        tone="violet"
        title="Outbox"
        subtitle="Every message to parents: waiting, sent, delivered or failed."
      />

      <StatRow>
        <StatCard tone="violet" icon="outbox" label="All messages">
          <CountUp value={totals?.all ?? 0} />
        </StatCard>
        <StatCard tone="green" icon="approvals" label="Sent or delivered">
          <CountUp value={totals?.arrived ?? 0} />
        </StatCard>
        <StatCard tone="blue" icon="sparkle" label="Test mode" note="recorded, not sent">
          <CountUp value={totals?.simulated ?? 0} />
        </StatCard>
        <StatCard tone="amber" icon="bell" label="Waiting" note="queued or in quiet hours">
          <CountUp value={totals?.queued ?? 0} />
        </StatCard>
        <StatCard tone="rose" icon="close" label="Failed">
          <CountUp value={totals?.failed ?? 0} />
        </StatCard>
      </StatRow>

      <div className="card table-card">
        <div className="toolbar">
          <Segmented
            label="Status"
            options={[
              ["", "All"],
              ["queued", "Waiting"],
              ["sent", "Sent"],
              ["delivered", "Delivered"],
              ["simulated", "Test mode"],
              ["failed", "Failed"],
            ]}
            value={filters.status}
            onChange={set("status")}
          />
          <Segmented
            label="Channel"
            options={[
              ["", "Any channel"],
              ["whatsapp", "WhatsApp"],
              ["sms", "SMS"],
              ["email", "Email"],
            ]}
            value={filters.channel}
            onChange={set("channel")}
          />
        </div>
        {error && (
          <p className="muted" style={{ padding: 20 }}>
            {error}
          </p>
        )}
        {data?.items.length === 0 ? (
          <EmptyState icon="outbox" title="No messages here">
            Messages appear once an approved message to parents starts sending.
          </EmptyState>
        ) : (
          <table>
            <thead>
              <tr>
                <th>To</th>
                <th>About</th>
                <th>Channel</th>
                <th>Subject</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((d) => {
                const [channelLabel, channelIcon] = CHANNEL[d.channel] ?? [d.channel, "outbox"];
                return (
                  <tr key={d.id}>
                    <td>
                      <div className="student-cell">
                        <Avatar name={d.to_name} size={34} />
                        <div>
                          <div className="student-name">{d.to_name}</div>
                          <div className="student-meta">{d.to_address}</div>
                        </div>
                      </div>
                    </td>
                    <td>{d.student_names}</td>
                    <td>
                      <span className={`chip chip--${d.channel}`}>
                        <Icon name={channelIcon} size={13} /> {channelLabel}
                      </span>
                    </td>
                    <td>{d.subject || <span className="muted">—</span>}</td>
                    <td>
                      <span className={`badge ${STATUS_TONE[d.status] ?? "neutral"}`}>
                        {d.status === "simulated" ? "test mode" : d.status}
                      </span>
                      {d.error && <div className="student-meta">{d.error}</div>}
                    </td>
                    <td className="muted">{displayDateTime(d.sent_at || d.send_after || d.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination data={data} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
