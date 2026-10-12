import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useDashboard, useDefaulters, useFeesPage } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatCurrency, displayDate, fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";

const emptyForm = { student_id: "", due_date: "", amount_due: "", amount_paid: "" };

export default function FeesPage() {
  const { can } = useAuth();
  const { data: stats } = useDashboard();
  const { data: defaulters = [] } = useDefaulters();
  const { students } = useLookups();
  const [filters, setFilters] = useState({ status: "", page: 1 });
  const { data: fees } = useFeesPage({ ...filters, pageSize: 20 });
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);

  const create = useApiMutation((values) => api.post("/fees", values), {
    invalidate: [keys.fees, keys.attention],
    success: (f) => `Fee record saved (${f.status})`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    // Status is derived on the server from the amounts.
    create.mutate(
      { ...form, student_id: Number(form.student_id) },
      {
        onSuccess: () => {
          setForm(emptyForm);
          setOpen(false);
        },
      }
    );
  };

  return (
    <section className="section">
      <PageHeader title="Fees" subtitle="What has been billed, what has come in, and who is behind.">
        {can("fees:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Record a fee
          </button>
        )}
      </PageHeader>
      {can("fees:write") && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Record a fee</h2>
            <span>The status (paid, partial or pending) follows from the amounts.</span>
          </div>
          <form className="form-row" onSubmit={submit}>
            <label>
              Student
              <select required autoFocus {...field("student_id")}>
                <option value="">Choose a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input type="date" required {...field("due_date")} />
            </label>
            <label>
              Amount due
              <input type="number" min="0" step="0.01" required {...field("amount_due")} />
            </label>
            <label>
              Paid so far <span className="label-hint">optional</span>
              <input type="number" min="0" step="0.01" {...field("amount_paid")} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save fee"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="grid-2">
        <div className="card fee-card">
          <div className="card__title">
            <h2>Totals</h2>
            <span>All time</span>
          </div>
          <div className="fee-metrics">
            <div>
              <span>Billed</span>
              <strong>{formatCurrency(stats?.feeDue)}</strong>
            </div>
            <div>
              <span>Collected</span>
              <strong>{formatCurrency(stats?.feeCollected)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{formatCurrency((stats?.feeDue || 0) - (stats?.feeCollected || 0))}</strong>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card__title">
            <h2>Overdue</h2>
            <span>{defaulters.length ? `${defaulters.length} records, most overdue first` : "None"}</span>
          </div>
          <ul className="alert-list">
            {defaulters.length === 0 && <li className="alert-item muted">Every fee is paid or not yet due.</li>}
            {defaulters.slice(0, 6).map((d) => (
              <li key={d.id} className="alert-item">
                <span className={`badge ${badgeClass(d.risk)}`}>{d.risk}</span>
                <div>
                  <div className="alert-text">
                    {d.student_name} · {formatCurrency(d.remaining_amount)}
                  </div>
                  <div className="alert-meta">{d.days_overdue} days overdue</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="card table-card">
        <div className="card__title">
          <h2>Fee records</h2>
          <span>Latest due date first</span>
        </div>
        <div className="filters">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value, page: 1 })}
            aria-label="Status"
          >
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="partial">Partly paid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Due</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fees?.items.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">
                  No fee records match.
                </td>
              </tr>
            )}
            {fees?.items.map((fee) => (
              <tr key={fee.id}>
                <td>{fee.student_name}</td>
                <td>{displayDate(fee.due_date)}</td>
                <td>{formatCurrency(fee.amount_due)}</td>
                <td>{formatCurrency(fee.amount_paid)}</td>
                <td>
                  <span className={`badge ${badgeClass(fee.status)}`}>{fee.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={fees} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
