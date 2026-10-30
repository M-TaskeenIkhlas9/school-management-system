import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { useToast } from "../../components/Toast.jsx";
import Segmented from "../../components/Segmented.jsx";
import Drawer from "../../components/Drawer.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { displayDate, formatCurrency, fullName } from "../../lib/format.js";
import { METHOD_LABEL, monthName, useRefreshFees } from "./FeeTools.jsx";

/** One receipt for a family payment: which child's month each part of it paid. */
function FamilyReceipt({ guardian, result, school }) {
  return (
    <div className="receipt print-receipt">
      <div className="receipt__head">
        <div>
          <strong className="receipt__school">{school?.name ?? "School"}</strong>
          <span>Family fee receipt</span>
        </div>
        <div className="receipt__no">
          <span>Receipt no.</span>
          <strong>{String(result.receipt_no).padStart(5, "0")}</strong>
        </div>
      </div>
      <dl className="receipt__rows">
        <div>
          <dt>Parent / guardian</dt>
          <dd>{guardian.full_name}</dd>
        </div>
        <div>
          <dt>Date paid</dt>
          <dd>{displayDate(result.paid_on)}</dd>
        </div>
        <div>
          <dt>Paid by</dt>
          <dd>{METHOD_LABEL[result.method] ?? result.method}</dd>
        </div>
        {result.applied.map((a) => (
          <div key={a.payment_id}>
            <dt>
              {a.child} · {monthName(a.month)}
            </dt>
            <dd>
              {formatCurrency(a.amount)}
              {a.status === "partial" ? " (part)" : ""}
            </dd>
          </div>
        ))}
        <div className="receipt__amount">
          <dt>Amount received</dt>
          <dd>{formatCurrency(result.amount)}</dd>
        </div>
        <div>
          <dt>Family balance left</dt>
          <dd>{result.outstanding_after ? formatCurrency(result.outstanding_after) : "Fully paid"}</dd>
        </div>
      </dl>
      <p className="receipt__sign">Received by: School office</p>
    </div>
  );
}

/** One family: every child's unpaid months, and one payment for all of them. */
function Statement({ guardianId, onBack }) {
  const toast = useToast();
  const refresh = useRefreshFees();
  const { school } = useAuth();
  const { data: s, refetch } = useQuery({
    queryKey: ["fees", "families", guardianId],
    queryFn: () => api.get(`/fees/families/${guardianId}`),
  });
  const [form, setForm] = useState({ amount: "", method: "cash", paid_on: "", note: "" });
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!s) return <p className="muted">Loading…</p>;
  const amount = form.amount === "" ? s.outstanding : Number(form.amount);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post(`/fees/families/${guardianId}/payments`, {
        amount,
        method: form.method,
        ...(form.paid_on ? { paid_on: form.paid_on } : {}),
        ...(form.note ? { note: form.note } : {}),
      });
      setReceipt(r);
      setForm((f) => ({ ...f, amount: "", note: "" }));
      toast.success(`Received ${formatCurrency(r.amount)} from ${s.guardian.full_name}`);
      refresh();
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="payment">
      <button type="button" className="btn link family__back" onClick={onBack}>
        ← All families
      </button>
      <div>
        <h2>{s.guardian.full_name}</h2>
        <p className="muted">
          {s.guardian.phone || "No phone"} · {s.children.length} {s.children.length === 1 ? "child" : "children"} ·{" "}
          {s.outstanding ? `${formatCurrency(s.outstanding)} to pay` : "nothing to pay"}
        </p>
      </div>

      {receipt ? (
        <>
          <FamilyReceipt guardian={s.guardian} result={receipt} school={school} />
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={() => window.print()}>
              Print receipt
            </button>
            <button type="button" className="btn ghost" onClick={() => setReceipt(null)}>
              Back to statement
            </button>
          </div>
        </>
      ) : (
        <>
          <ul className="family__children">
            {s.children.map((c) => (
              <li key={c.id}>
                <div className="family__child">
                  <Avatar name={c.name} size={32} />
                  <span className="family__who">
                    <strong>{c.name}</strong>
                    <span className="muted">
                      {c.class_name ? `${c.class_name}${c.section ? ` (${c.section})` : ""}` : "No class"}
                      {c.roll_number ? ` · Roll ${c.roll_number}` : ""}
                    </span>
                  </span>
                  <strong className={c.outstanding ? "family__owed" : "family__owed is-clear"}>
                    {c.outstanding ? formatCurrency(c.outstanding) : "Paid up"}
                  </strong>
                </div>
                {c.unpaid.length > 0 && (
                  <ul className="family__months">
                    {c.unpaid.map((f) => (
                      <li key={f.id}>
                        <span>
                          {f.month ? monthName(f.month) : `Due ${displayDate(f.due_date)}`}
                          {f.discount > 0 && <span className="cell-note">{f.discount_note || "Discount"}</span>}
                        </span>
                        <span>
                          {formatCurrency(f.remaining)}
                          {f.amount_paid > 0 && <span className="muted"> of {formatCurrency(f.amount_due)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          {s.outstanding > 0 && (
            <form className="payment__form" onSubmit={submit}>
              <div>
                <h3>Receive one payment for the family</h3>
                <p className="muted">It pays the oldest months first, eldest child first within a month.</p>
              </div>
              <label className="field-label">
                Amount received{" "}
                <span className="label-hint">leave empty for the full {formatCurrency(s.outstanding)}</span>
                <input
                  type="number"
                  min="1"
                  max={s.outstanding}
                  step="1"
                  placeholder={String(s.outstanding)}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
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
                <button type="submit" className="btn primary btn--lg" disabled={busy || !(amount > 0)}>
                  {busy ? "Saving…" : `Receive ${formatCurrency(amount)}`}
                </button>
              </div>
            </form>
          )}

          {s.payments.length > 0 && (
            <div className="payment__history">
              <h3>Recent payments</h3>
              <ul>
                {s.payments.map((p) => (
                  <li key={p.id}>
                    <span>
                      <strong>{formatCurrency(p.amount)}</strong> ·{" "}
                      {s.children.find((c) => c.id === p.student_id)?.name ?? "—"} · {monthName(p.month)}
                    </span>
                    <span className="muted">
                      {displayDate(p.paid_on)} · {METHOD_LABEL[p.method] ?? p.method}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Find a family by parent name, phone or a child's name; open its statement. */
export function FamiliesDrawer({ onClose }) {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState(null);
  const { data: families = [], isLoading } = useQuery({
    queryKey: ["fees", "families", "list", q.trim()],
    queryFn: () => api.get(`/fees/families?q=${encodeURIComponent(q.trim())}`),
    enabled: !openId,
  });

  return (
    <Drawer title="Family accounts" onClose={onClose}>
      {openId ? (
        <Statement guardianId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <div className="payment">
          <div>
            <h2>Family accounts</h2>
            <p className="muted">Brothers and sisters under one parent share one statement and can pay together.</p>
          </div>
          <label className="family__search">
            <Icon name="search" size={18} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Parent name, phone or child's name"
              aria-label="Search families"
            />
          </label>
          {!isLoading && families.length === 0 ? (
            <EmptyState icon="search" title="No family found">
              Families come from each student&apos;s primary parent or guardian.
            </EmptyState>
          ) : (
            <ul className="family__list">
              {families.map((f) => (
                <li key={f.id}>
                  <button type="button" className="family__row" onClick={() => setOpenId(f.id)}>
                    <Avatar name={f.full_name} size={36} />
                    <span className="family__who">
                      <strong>{f.full_name}</strong>
                      <span className="muted">
                        {f.children} {f.children === 1 ? "child" : "children"} · {f.child_names}
                      </span>
                    </span>
                    <span className={f.outstanding ? "family__owed" : "family__owed is-clear"}>
                      {f.outstanding ? formatCurrency(f.outstanding) : "Paid up"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Drawer>
  );
}

const KINDS = [
  ["scholarship", "Scholarship"],
  ["staff_child", "Staff child"],
  ["need_based", "Need-based"],
  ["other", "Other"],
];
const emptyConcession = { student_id: "", kind: "scholarship", type: "percent", value: "", note: "" };

/** Standing concessions, taken off every month's bill until they are ended. */
export function ConcessionsDrawer({ students, onClose }) {
  const toast = useToast();
  const { school } = useAuth();
  const { data: list = [], refetch } = useQuery({
    queryKey: ["fees", "concessions"],
    queryFn: () => api.get("/fees/concessions"),
  });
  const [form, setForm] = useState(emptyConcession);
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const sibling = Number(school?.sibling_discount) || 0;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const c = await api.post("/fees/concessions", {
        ...form,
        student_id: Number(form.student_id),
        value: Number(form.value),
      });
      toast.success(`${c.label} given to ${c.student_name}`);
      setForm(emptyConcession);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const end = async (c) => {
    if (!window.confirm(`End the ${c.label.toLowerCase()} for ${c.student_name}? Bills already made stay as they are.`))
      return;
    try {
      await api.del(`/fees/concessions/${c.id}`);
      toast.success("Concession ended");
      refetch();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Drawer title="Concessions" onClose={onClose}>
      <div className="payment">
        <div>
          <h2>Concessions</h2>
          <p className="muted">
            Taken off every month&apos;s fee when you bill a month, until you end them.{" "}
            {sibling
              ? `The sibling discount (${sibling}%) is applied on its own.`
              : "A sibling discount can be set on Settings."}
          </p>
        </div>

        {list.length === 0 ? (
          <EmptyState icon="fees" title="No concessions yet">
            Add a scholarship, staff-child or need-based concession below.
          </EmptyState>
        ) : (
          <ul className="family__list">
            {list.map((c) => (
              <li key={c.id} className="family__row">
                <Avatar name={c.student_name} size={32} />
                <span className="family__who">
                  <strong>{c.student_name}</strong>
                  <span className="muted">
                    {c.label} · {c.type === "percent" ? `${c.value}%` : formatCurrency(c.value)} off
                    {c.note ? ` · ${c.note}` : ""}
                  </span>
                </span>
                <button type="button" className="btn ghost small" onClick={() => end(c)}>
                  End
                </button>
              </li>
            ))}
          </ul>
        )}

        <form className="payment__form" onSubmit={submit}>
          <h3>Give a concession</h3>
          <label className="field-label">
            Student
            <select required value={form.student_id} onChange={set("student_id")}>
              <option value="">Choose a student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Kind
            <select value={form.kind} onChange={set("kind")}>
              {KINDS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="field-label">
            Off each month
            <Segmented
              label="Concession type"
              options={[
                ["percent", "Percent"],
                ["amount", "Fixed amount"],
              ]}
              value={form.type}
              onChange={(type) => setForm((f) => ({ ...f, type }))}
            />
          </div>
          <label className="field-label">
            {form.type === "percent" ? "Percent off" : "Amount off"}
            <input
              type="number"
              required
              min="1"
              max={form.type === "percent" ? 100 : undefined}
              step="1"
              placeholder={form.type === "percent" ? "e.g. 50" : "e.g. 1000"}
              value={form.value}
              onChange={set("value")}
            />
          </label>
          <label className="field-label">
            Note <span className="label-hint">optional, e.g. why it was given</span>
            <input value={form.note} maxLength={200} onChange={set("note")} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Give concession"}
            </button>
          </div>
        </form>
      </div>
    </Drawer>
  );
}
