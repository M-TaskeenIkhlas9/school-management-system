import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { GenerateFees, PaymentDrawer } from "./FeeTools.jsx";
import Challans from "./Challans.jsx";
import { ConcessionsDrawer, FamiliesDrawer } from "./Families.jsx";
import { OnlinePaymentsDrawer } from "./OnlinePayments.jsx";

const emptyForm = { student_id: "", due_date: "", amount_due: "", amount_paid: "" };

export default function FeesPage() {
  const { can } = useAuth();
  const { data: stats } = useDashboard();
  const { data: defaulters = [] } = useDefaulters();
  const { students, classrooms } = useLookups();
  const [filters, setFilters] = useState({ status: "", page: 1 });
  const { data: fees } = useFeesPage({ ...filters, pageSize: 20 });
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState(false);
  const [paying, setPaying] = useState(null);
  const [challans, setChallans] = useState(null); // { feeId? } when open
  const [drawer, setDrawer] = useState(null); // "families" | "concessions" | "online"
  const canWrite = can("fees:write");
  const { data: online } = useQuery({
    queryKey: ["fees", "online", "summary"],
    queryFn: () => api.get("/fees/online/summary"),
    enabled: canWrite,
  });
  const removeFee = useApiMutation((id) => api.del(`/fees/${id}`), {
    invalidate: [keys.fees, keys.attention],
    success: "Fee deleted",
  });

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
        {canWrite && !open && !billing && (
          <>
            <button type="button" className="btn ghost" onClick={() => setDrawer("families")}>
              <Icon name="students" size={18} /> Families
            </button>
            <button type="button" className="btn ghost" onClick={() => setDrawer("concessions")}>
              Concessions
            </button>
            <button type="button" className="btn ghost" onClick={() => setDrawer("online")}>
              Online payments
              {online?.unmatched > 0 && (
                <span className="btn__count" title={`${online.unmatched} to match`}>
                  {online.unmatched}
                </span>
              )}
            </button>
            <button type="button" className="btn ghost" onClick={() => setChallans({})}>
              <Icon name="exams" size={18} /> Print challans
            </button>
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
              Add one fee
            </button>
            <button type="button" className="btn primary" onClick={() => setBilling(true)}>
              <Icon name="plus" size={18} strokeWidth={2} /> Bill a month
            </button>
          </>
        )}
      </PageHeader>
      {canWrite && billing && <GenerateFees classrooms={classrooms} onDone={() => setBilling(false)} />}
      {canWrite && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Add one fee</h2>
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
                {canWrite && <th aria-label="Actions" />}
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
                    <td>
                      {formatCurrency(fee.amount_due)}
                      {Number(fee.discount) > 0 && (
                        <span className="cell-note" title={`${formatCurrency(fee.discount)} off`}>
                          {fee.discount_note || "Discount"}
                        </span>
                      )}
                    </td>
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
                    {canWrite && (
                      <td>
                        <div className="row-actions">
                          {Number(fee.amount_paid) < Number(fee.amount_due) ? (
                            <>
                              <button type="button" className="btn link" onClick={() => setChallans({ feeId: fee.id })}>
                                Challan
                              </button>
                              <button type="button" className="btn primary small" onClick={() => setPaying(fee)}>
                                Receive payment
                              </button>
                            </>
                          ) : (
                            <button type="button" className="btn ghost small" onClick={() => setPaying(fee)}>
                              Receipts
                            </button>
                          )}
                          {Number(fee.amount_paid) === 0 && (
                            <button
                              type="button"
                              className="icon-btn-danger"
                              aria-label={`Delete this fee for ${fee.student_name}`}
                              title="Delete (entered by mistake)"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Delete the ${formatCurrency(fee.amount_due)} fee for ${fee.student_name}?`
                                  )
                                ) {
                                  removeFee.mutate(fee.id);
                                }
                              }}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Pagination data={fees} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
      {paying && <PaymentDrawer fee={paying} onClose={() => setPaying(null)} />}
      {drawer === "families" && <FamiliesDrawer onClose={() => setDrawer(null)} />}
      {drawer === "concessions" && <ConcessionsDrawer students={students} onClose={() => setDrawer(null)} />}
      {drawer === "online" && <OnlinePaymentsDrawer onClose={() => setDrawer(null)} />}
      {challans && <Challans classrooms={classrooms} feeId={challans.feeId} onClose={() => setChallans(null)} />}
    </section>
  );
}
