import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useDashboard, useDefaulters, useFeesPage } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatCurrency, formatDate, fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";

const emptyForm = { student_id: "", due_date: "", amount_due: "", amount_paid: "" };
export const FEE_REMINDER_PROMPT = "Email the parents whose fees are due";

export default function FeesPage() {
  const navigate = useNavigate();
  const { data: stats } = useDashboard();
  const { data: defaulters = [] } = useDefaulters();
  const { students } = useLookups();
  const [filters, setFilters] = useState({ status: "", page: 1 });
  const { data: fees } = useFeesPage({ ...filters, pageSize: 20 });
  const [form, setForm] = useState(emptyForm);

  const create = useApiMutation((values) => api.post("/fees", values), {
    invalidate: [keys.fees, keys.attention],
    success: (f) => `Fee record saved (${f.status})`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    // Status is derived on the server from the amounts.
    create.mutate({ ...form, student_id: Number(form.student_id) }, { onSuccess: () => setForm(emptyForm) });
  };

  return (
    <section className="section active">
      <PageHeader title="Accounts & Fees" subtitle="Track paid, unpaid, and partial fees.">
        <button
          className="btn primary"
          onClick={() => navigate(`/ai-center?ask=${encodeURIComponent(FEE_REMINDER_PROMPT)}`)}
        >
          Send Reminders
        </button>
      </PageHeader>
      <div className="card form-card">
        <div className="card__title">
          <h4>Add Fee Record</h4>
          <span className="ai-pill">Ledger</span>
        </div>
        <form className="form-row" onSubmit={submit}>
          <select required {...field("student_id")}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </select>
          <input type="date" required title="Due date" {...field("due_date")} />
          <input type="number" min="0" step="0.01" placeholder="Amount due" required {...field("amount_due")} />
          <input type="number" min="0" step="0.01" placeholder="Amount paid" {...field("amount_paid")} />
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save Fee"}
            </button>
          </div>
        </form>
      </div>
      <div className="grid-2">
        <div className="card fee-card">
          <div className="card__title">
            <h4>Fee Summary</h4>
            <span className="ai-pill">All time</span>
          </div>
          <div className="fee-metrics">
            <div>
              <span>Total billed</span>
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
            <h4>Overdue (most overdue first)</h4>
            <span className="ai-pill success">{defaulters.length} records</span>
          </div>
          <ul className="alert-list">
            {defaulters.length === 0 && <li className="alert-item">No overdue fees. 🎉</li>}
            {defaulters.slice(0, 6).map((d) => (
              <li key={d.id} className="alert-item">
                <span className={`badge ${badgeClass(d.risk)} pill`}>{d.risk}</span>
                <div>
                  <div className="alert-text">
                    {d.student_name} — {formatCurrency(d.remaining_amount)}
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
          <h5>Fee Records</h5>
          <span>Latest due date first</span>
        </div>
        <div className="filters">
          <select value={filters.status} onChange={(e) => setFilters({ status: e.target.value, page: 1 })}>
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="partial">Partial</option>
            <option value="paid">Paid</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Due Date</th>
              <th>Amount Due</th>
              <th>Paid</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {fees?.items.length === 0 && (
              <tr>
                <td colSpan="5">No fee records match.</td>
              </tr>
            )}
            {fees?.items.map((fee) => (
              <tr key={fee.id}>
                <td>{fee.student_name}</td>
                <td>{formatDate(fee.due_date)}</td>
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
