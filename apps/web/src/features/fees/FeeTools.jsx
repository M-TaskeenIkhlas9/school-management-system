import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import Segmented from "../../components/Segmented.jsx";
import Drawer from "../../components/Drawer.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { displayDate, formatCurrency } from "../../lib/format.js";

const thisMonth = () => new Date().toISOString().slice(0, 7);
export const METHOD_LABEL = {
  cash: "Cash",
  bank: "Bank transfer",
  online: "Online (JazzCash/Easypaisa)",
  other: "Other",
  "1bill": "1Bill (bank app, JazzCash, Easypaisa)",
  raast: "Raast",
};
export const monthName = (ym) =>
  ym
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${ym}-01T00:00:00Z`)
      )
    : "";

export function useRefreshFees() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [keys.fees, keys.dashboard, keys.students, keys.attention]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

/** Bill a month's fee to a class (or every class). Students already billed that month are skipped. */
export function GenerateFees({ classrooms, onDone }) {
  const toast = useToast();
  const refresh = useRefreshFees();
  const [form, setForm] = useState(() => {
    const month = thisMonth();
    return { month, classroom_id: "", amount: "", due_date: `${month}-10` };
  });
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) =>
    setForm((f) => ({
      ...f,
      [name]: e.target.value,
      ...(name === "month" ? { due_date: `${e.target.value}-10` } : {}),
    }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post("/fees/generate", {
        month: form.month,
        due_date: form.due_date,
        amount: Number(form.amount),
        ...(form.classroom_id ? { classroom_id: Number(form.classroom_id) } : {}),
      });
      toast.success(
        r.created
          ? `Billed ${r.created} students for ${monthName(r.month)} (${formatCurrency(r.total)})` +
              (r.discounted
                ? `, with ${formatCurrency(r.discount)} off for ${r.discounted} (siblings and concessions)`
                : "") +
              (r.skipped ? `. ${r.skipped} were already billed.` : ".")
          : `Everyone was already billed for ${monthName(r.month)}.`
      );
      refresh();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form-card" onSubmit={submit}>
      <div className="card__head">
        <div>
          <h2>Bill a month&apos;s fee</h2>
          <p>
            Creates the monthly fee for every student in the class. Anyone already billed for that month is skipped.
          </p>
        </div>
      </div>
      <div className="form-row">
        <label>
          Month
          <input type="month" value={form.month} onChange={set("month")} required />
        </label>
        <label>
          Class
          <select value={form.classroom_id} onChange={set("classroom_id")}>
            <option value="">All classes</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` • ${c.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Monthly fee per student
          <input
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 3500"
            value={form.amount}
            onChange={set("amount")}
            required
          />
        </label>
        <label>
          Due date
          <input type="date" value={form.due_date} onChange={set("due_date")} required />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Billing…" : "Bill the month"}
          </button>
          <button type="button" className="btn ghost" onClick={onDone}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

/** A printable receipt for one payment. */
function Receipt({ fee, payment, school }) {
  const left = Math.max(0, Number(fee.amount_due) - Number(fee.amount_paid));
  return (
    <div className="receipt print-receipt">
      <div className="receipt__head">
        <div>
          <strong className="receipt__school">{school?.name ?? "School"}</strong>
          <span>Fee receipt</span>
        </div>
        <div className="receipt__no">
          <span>Receipt no.</span>
          <strong>{String(payment.payment_id ?? payment.id).padStart(5, "0")}</strong>
        </div>
      </div>
      <dl className="receipt__rows">
        <div>
          <dt>Student</dt>
          <dd>{fee.student_name}</dd>
        </div>
        <div>
          <dt>Fee for</dt>
          <dd>{fee.month ? monthName(fee.month) : `due ${displayDate(fee.due_date)}`}</dd>
        </div>
        <div>
          <dt>Date paid</dt>
          <dd>{displayDate(payment.paid_on)}</dd>
        </div>
        <div>
          <dt>Paid by</dt>
          <dd>{METHOD_LABEL[payment.method] ?? payment.method}</dd>
        </div>
        {payment.reference && (
          <div>
            <dt>Transaction</dt>
            <dd>{payment.reference}</dd>
          </div>
        )}
        <div className="receipt__amount">
          <dt>Amount received</dt>
          <dd>{formatCurrency(Number(payment.amount) + (Number(payment.late_fine) || 0))}</dd>
        </div>
        {Number(payment.late_fine) > 0 && (
          <div>
            <dt>Of which late fine</dt>
            <dd>{formatCurrency(payment.late_fine)}</dd>
          </div>
        )}
        <div>
          <dt>Total fee</dt>
          <dd>{formatCurrency(fee.amount_due)}</dd>
        </div>
        {Number(fee.discount) > 0 && (
          <div>
            <dt>Discount given</dt>
            <dd>
              {formatCurrency(fee.discount)}
              {fee.discount_note ? ` (${fee.discount_note})` : ""}
            </dd>
          </div>
        )}
        <div>
          <dt>Balance left</dt>
          <dd>{left ? formatCurrency(left) : "Fully paid"}</dd>
        </div>
      </dl>
      <p className="receipt__sign">Received by: {payment.received_by ?? "School office"}</p>
    </div>
  );
}

/** Receive a payment (full or instalment) for one fee, then show its receipt to print. */
export function PaymentDrawer({ fee, onClose }) {
  const toast = useToast();
  const refresh = useRefreshFees();
  const { school } = useAuth();
  const remaining = Math.max(0, Number(fee.amount_due) - Number(fee.amount_paid));
  const [form, setForm] = useState({ amount: String(remaining), method: "cash", paid_on: "", note: "" });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const { data: history = [] } = useQuery({
    queryKey: ["fees", fee.id, "payments"],
    queryFn: () => api.get(`/fees/${fee.id}/payments`),
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/fees/${fee.id}/payments`, {
        amount: Number(form.amount),
        method: form.method,
        ...(form.paid_on ? { paid_on: form.paid_on } : {}),
        ...(form.note ? { note: form.note } : {}),
      });
      setReceipt({
        fee: { ...fee, ...r.fee, student_name: fee.student_name },
        payment: { ...r, received_by: undefined },
      });
      toast.success(`Received ${formatCurrency(r.amount)} from ${fee.student_name}`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title="Fee payment" onClose={onClose}>
      <div className="payment">
        <h2>{fee.student_name}</h2>
        <p className="muted">
          {fee.month ? monthName(fee.month) : `Due ${displayDate(fee.due_date)}`} · {formatCurrency(fee.amount_due)} ·{" "}
          {remaining ? `${formatCurrency(remaining)} left to pay` : "fully paid"}
        </p>

        {receipt ? (
          <>
            <Receipt {...receipt} school={school} />
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={() => window.print()}>
                Print receipt
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : remaining > 0 ? (
          <form className="payment__form" onSubmit={submit}>
            <label className="field-label">
              Amount received
              <input
                type="number"
                min="1"
                max={remaining}
                step="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </label>
            <div className="field-label">
              Paid by
              <Segmented
                label="Paid by"
                options={[
                  ["cash", "Cash"],
                  ["bank", "Bank"],
                  ["online", "Online"],
                ]}
                value={form.method}
                onChange={(method) => setForm((f) => ({ ...f, method }))}
              />
            </div>
            <label className="field-label">
              Date <span className="label-hint">leave empty for today</span>
              <input
                type="date"
                value={form.paid_on}
                onChange={(e) => setForm((f) => ({ ...f, paid_on: e.target.value }))}
              />
            </label>
            <label className="field-label">
              Note <span className="label-hint">optional, e.g. challan or transaction number</span>
              <input
                value={form.note}
                maxLength={200}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary btn--lg" disabled={busy}>
                {busy ? "Saving…" : `Receive ${form.amount ? formatCurrency(Number(form.amount)) : "payment"}`}
              </button>
            </div>
          </form>
        ) : null}

        {history.length > 0 && !receipt && (
          <div className="payment__history">
            <h3>Earlier payments</h3>
            <ul>
              {history.map((p) => (
                <li key={p.id}>
                  <span>
                    <strong>{formatCurrency(p.amount)}</strong> · {METHOD_LABEL[p.method] ?? p.method}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="muted">
                    {displayDate(p.paid_on)} · {p.received_by ?? "—"}
                  </span>
                  <button type="button" className="btn link" onClick={() => setReceipt({ fee, payment: p })}>
                    Receipt
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}
