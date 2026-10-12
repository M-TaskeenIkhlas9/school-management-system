import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useState } from "react";
import Pagination from "../../components/Pagination.jsx";
import { usersApi, usersKey } from "./api.js";
import { displayDateTime } from "../../lib/format.js";
import { ACTIVITY_KINDS, ROLE_LABEL, describeActivity, displayIp } from "./labels.js";

export default function ActivityTab() {
  const [filters, setFilters] = useState({ action: "", user_id: "", page: 1 });
  const { data: users = [] } = useQuery({ queryKey: usersKey, queryFn: usersApi.list });
  const params = Object.fromEntries(Object.entries({ ...filters, pageSize: 25 }).filter(([, v]) => v !== ""));
  const { data, error } = useQuery({
    queryKey: [...usersKey, "activity", params],
    queryFn: () => usersApi.activity(params),
    placeholderData: keepPreviousData,
  });
  const set = (name) => (e) => setFilters((f) => ({ ...f, [name]: e.target.value, page: 1 }));

  return (
    <div className="card table-card">
      <div className="filters">
        <select value={filters.action} onChange={set("action")} aria-label="Kind of activity">
          {ACTIVITY_KINDS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={filters.user_id} onChange={set("user_id")} aria-label="Person">
          <option value="">Anyone</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.username} ({ROLE_LABEL[u.role] ?? u.role})
            </option>
          ))}
        </select>
      </div>
      {error && <p className="muted">{error.message}</p>}
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Who</th>
            <th>What</th>
            <th>From</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.length === 0 && (
            <tr>
              <td colSpan="4">Nothing recorded yet.</td>
            </tr>
          )}
          {data?.items.map((a) => (
            <tr key={a.id} className={a.action === "auth.login_failed" ? "row-warning" : ""}>
              <td>{displayDateTime(a.created_at)}</td>
              <td>{a.username ?? <span className="muted">—</span>}</td>
              <td>{describeActivity(a)}</td>
              <td className="muted">{displayIp(a.ip)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination data={data} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
    </div>
  );
}
