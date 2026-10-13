import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useDashboard, useDefaulters, useFeesPage } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatCurrency, displayDate, fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";

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

  const outstanding = Math.max(0, (stats?.feeDue || 0) - (stats?.feeCollected || 0));
  const share = stats?.feeDue ? Math.round(((stats.feeCollected || 0) / stats.feeDue) * 100) : 0;
  const overdueAmount = defaulters.reduce((sum, d) => sum + (Number(d.remaining_amount) || 0), 0);

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
      <PageHeader
        icon="fees"
        tone="amber"
        title="Fees"
        subtitle="What has been billed, what has come in, and who is behind."
      >
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
      <StatRow>
        <StatCard tone="blue" icon="fees" label="Billed" note="all fee records">
          <CountUp value={stats?.feeDue ?? 0} format={formatCurrency} />
        </StatCard>
        <StatCard tone="green" icon="money" label="Collected" note={`${share}% of billed`}>
          <CountUp value={stats?.feeCollected ?? 0} format={formatCurrency} />
        </StatCard>
        <StatCard tone="amber" icon="card" label="Outstanding" note="still to come in">
          <CountUp value={outstanding} format={formatCurrency} />
        </StatCard>
        <StatCard tone="rose" icon="bell" label="Overdue records" note="past their due date">
          <CountUp value={defaulters.length} />
        </StatCard>
      </StatRow>

      <div className="grid-2">
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Collection</h2>
              <p>How much of what was billed has been paid</p>
            </div>
          </div>
          <div className="collection">
            <div className="collection__ring" style={{ "--p": share }}>
              <span>
                <strong>{share}%</strong>
                collected
              </span>
            </div>
            <dl className="collection__legend">
              <div>
                <dt>
                  <i className="dot dot--green" /> Collected
                </dt>
                <dd>{formatCurrency(stats?.feeCollected)}</dd>
              </div>
              <div>
                <dt>
                  <i className="dot dot--amber" /> Outstanding
                </dt>
                <dd>{formatCurrency(outstanding)}</dd>
              </div>
              <div>
                <dt>
                  <i className="dot dot--rose" /> Overdue
                </dt>
                <dd>{formatCurrency(overdueAmount)}</dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Overdue</h2>
              <p>Most overdue first</p>
            </div>
            {can("messages:draft") && defaulters.length > 0 && (
              <Link
                className="btn ghost small"
                to="/ai-center?q=Send%20a%20fee%20reminder%20to%20the%20parents%20whose%20fees%20are%20overdue"
              >
                <Icon name="message" size={16} /> Send reminders
              </Link>
            )}
          </div>
          {defaulters.length === 0 ? (
            <EmptyState icon="fees" title="Nothing overdue">
              Every fee is paid or not yet due.
            </EmptyState>
          ) : (
            <ul className="alert-list">
              {defaulters.slice(0, 5).map((d) => (
                <li key={d.id} className="alert-item">
                  <Avatar name={d.student_name} size={36} />
                  <div>
                    <div className="alert-text">{d.student_name}</div>
                    <div className="alert-meta">{d.days_overdue} days overdue</div>
                  </div>
                  <span className="alert-amount">{formatCurrency(d.remaining_amount)}</span>
                  <span className={`badge ${badgeClass(d.risk)}`}>{d.risk}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card table-card">
        <div className="toolbar">
          <div className="card__head" style={{ margin: 0 }}>
            <h2>Fee records</h2>
          </div>
          <Segmented
            label="Status"
            options={[
              ["", "All"],
              ["pending", "Pending"],
              ["partial", "Partly paid"],
              ["paid", "Paid"],
            ]}
            value={filters.status}
            onChange={(status) => setFilters({ status, page: 1 })}
          />
        </div>
        {fees?.items.length === 0 ? (
          <EmptyState icon="fees" title="No fee records match">
            Try another status.
          </EmptyState>
        ) : (
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
              {fees?.items.map((fee) => {
                const paidShare = fee.amount_due ? Math.round((fee.amount_paid / fee.amount_due) * 100) : 0;
                return (
                  <tr key={fee.id}>
                    <td>
                      <div className="student-cell">
                        <Avatar name={fee.student_name} size={34} />
                        <span className="student-name">{fee.student_name}</span>
                      </div>
                    </td>
                    <td>{displayDate(fee.due_date)}</td>
                    <td>{formatCurrency(fee.amount_due)}</td>
                    <td>
                      <div className="meter">
                        <span className="meter__track">
                          <span
                            className={`meter__fill ${paidShare >= 100 ? "is-good" : paidShare > 0 ? "is-mid" : "is-low"}`}
                            style={{ width: `${Math.max(paidShare, 2)}%` }}
                          />
                        </span>
                        <strong>{formatCurrency(fee.amount_paid)}</strong>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${badgeClass(fee.status)}`}>{fee.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination data={fees} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
