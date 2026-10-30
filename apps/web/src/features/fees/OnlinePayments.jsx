import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { useToast } from "../../components/Toast.jsx";
import Segmented from "../../components/Segmented.jsx";
import Drawer from "../../components/Drawer.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Pagination from "../../components/Pagination.jsx";
import Icon from "../../app/Icon.jsx";
import { displayDate, formatCurrency } from "../../lib/format.js";
import { readStatement } from "../../lib/statement.js";
import { monthName, useRefreshFees } from "./FeeTools.jsx";

const CHANNEL = { "1bill": "1Bill", raast: "Raast", bank: "Bank transfer" };
const STATUS_BADGE = { matched: "success", unmatched: "warning", ignored: "neutral" };

/** Pick the fee a waiting payment is for: same amount first, then a parent with the payer's name. */
function MatchPayment({ payment, onBack, onDone }) {
  const toast = useToast();
  const refresh = useRefreshFees();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: fees = [], isLoading } = useQuery({
    queryKey: ["fees", "online", payment.id, "candidates", q.trim()],
    queryFn: () => api.get(`/fees/online/${payment.id}/candidates?q=${encodeURIComponent(q.trim())}`),
  });

  const match = async (fee) => {
    setBusy(true);
    try {
      await api.post(`/fees/online/${payment.id}/match`, { fee_id: fee.id });
      toast.success(`${formatCurrency(payment.amount)} recorded for ${fee.student_name}`);
      refresh();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const setAside = async () => {
    const note = window.prompt("Why is this not a fee payment? (e.g. donation, refund)", "Not a fee payment");
    if (note === null) return;
    try {
      await api.post(`/fees/online/${payment.id}/ignore`, { note });
      toast.success("Set aside");
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="payment">
      <button type="button" className="btn link family__back" onClick={onBack}>
        ← All online payments
      </button>
      <div>
        <h2>
          {formatCurrency(payment.amount)} · {CHANNEL[payment.channel]}
        </h2>
        <p className="muted">
          {displayDate(payment.paid_on)}
          {payment.payer ? ` · from ${payment.payer}` : ""}
          {payment.reference ? ` · “${payment.reference}”` : ""}
        </p>
        {payment.note && <p className="online__why">{payment.note}</p>}
      </div>
      <label className="family__search">
        <Icon name="search" size={18} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Student or parent name"
          aria-label="Search unpaid fees"
        />
      </label>
      {!isLoading && fees.length === 0 ? (
        <EmptyState icon="search" title="No unpaid fee found">
          Try another name.
        </EmptyState>
      ) : (
        <ul className="family__list">
          {fees.map((f) => {
            const exact = Math.abs(f.remaining - payment.amount) < 0.005;
            return (
              <li key={f.id} className="family__row">
                <span className="family__who">
                  <strong>{f.student_name}</strong>
                  <span className="muted">
                    {f.month ? monthName(f.month) : `Due ${displayDate(f.due_date)}`}
                    {f.class_name ? ` · ${f.class_name}` : ""}
                    {f.guardian_name ? ` · ${f.guardian_name}` : ""}
                  </span>
                </span>
                <span className={exact ? "family__owed is-clear" : "family__owed"}>
                  {formatCurrency(f.remaining)} left
                </span>
                <button type="button" className="btn primary small" disabled={busy} onClick={() => match(f)}>
                  Match
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={setAside}>
          Not a fee payment
        </button>
      </div>
    </div>
  );
}

/** Upload the school account's statement (CSV); credits with a payment reference are matched at once. */
function ImportStatement({ onBack, onDone }) {
  const toast = useToast();
  const refresh = useRefreshFees();
  const [read, setRead] = useState(null); // { rows, skipped, error, name }
  const [channel, setChannel] = useState("raast");
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRead({ ...readStatement(await file.text()), name: file.name });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.post("/fees/online/import", { channel, rows: read.rows });
      toast.success(
        `${r.matched} matched to fees, ${r.unmatched} to match by hand` +
          (r.duplicates ? `, ${r.duplicates} already imported` : "")
      );
      refresh();
      onDone();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const total = read?.rows.reduce((n, r) => n + r.amount, 0) ?? 0;
  return (
    <div className="payment">
      <button type="button" className="btn link family__back" onClick={onBack}>
        ← All online payments
      </button>
      <div>
        <h2>Import a bank statement</h2>
        <p className="muted">
          Download the school account&apos;s statement from internet banking as CSV. Credits whose remarks contain a
          challan&apos;s payment reference are recorded straight away; the rest wait here for you to match. Importing
          the same statement again changes nothing.
        </p>
      </div>
      <div className="field-label">
        These credits came by
        <Segmented
          label="These credits came by"
          options={[
            ["raast", "Raast"],
            ["bank", "Bank transfer (IBFT)"],
          ]}
          value={channel}
          onChange={setChannel}
        />
      </div>
      <label className="field-label">
        Statement file (.csv)
        <input type="file" accept=".csv,text/csv" onChange={pick} />
      </label>
      {read?.error && <p className="settings-form__warn">{read.error}</p>}
      {read && !read.error && (
        <p className="muted">
          {read.rows.length} {read.rows.length === 1 ? "credit" : "credits"} worth {formatCurrency(total)} in{" "}
          {read.name}
          {read.skipped
            ? ` (${read.skipped} other ${read.skipped === 1 ? "line" : "lines"} skipped: debits or no date)`
            : ""}
          .
        </p>
      )}
      <div className="form-actions">
        <button type="button" className="btn primary" disabled={busy || !read?.rows.length} onClick={submit}>
          {busy ? "Importing…" : `Import ${read?.rows.length || ""} credits`}
        </button>
      </div>
    </div>
  );
}

/** Payments that came in by 1Bill, Raast or bank transfer, and the ones waiting to be matched. */
export function OnlinePaymentsDrawer({ onClose }) {
  const [status, setStatus] = useState("unmatched");
  const [page, setPage] = useState(1);
  const [view, setView] = useState(null); // { match: payment } | { import: true }
  const params = `page=${page}&pageSize=20${status ? `&status=${status}` : ""}`;
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["fees", "online", status, page],
    queryFn: () => api.get(`/fees/online?${params}`),
    enabled: !view,
  });
  const back = () => {
    setView(null);
    refetch();
  };

  return (
    <Drawer title="Online payments" onClose={onClose}>
      {view?.match ? (
        <MatchPayment payment={view.match} onBack={() => setView(null)} onDone={back} />
      ) : view?.import ? (
        <ImportStatement onBack={() => setView(null)} onDone={back} />
      ) : (
        <div className="payment">
          <div className="online__head">
            <div>
              <h2>Online payments</h2>
              <p className="muted">
                1Bill payments are recorded on their own. Raast and bank transfers are matched by the payment reference
                on the challan.
              </p>
            </div>
            <button type="button" className="btn ghost small" onClick={() => setView({ import: true })}>
              Import statement
            </button>
          </div>
          <Segmented
            label="Show"
            options={[
              ["unmatched", "To match"],
              ["matched", "Recorded"],
              ["ignored", "Set aside"],
              ["", "All"],
            ]}
            value={status}
            onChange={(s) => {
              setStatus(s);
              setPage(1);
            }}
          />
          {!isLoading && data?.items.length === 0 ? (
            <EmptyState icon="fees" title={status === "unmatched" ? "Nothing to match" : "No payments here"}>
              {status === "unmatched"
                ? "Every payment that came in online has been matched to a fee."
                : "Payments by 1Bill, Raast or bank transfer will show here."}
            </EmptyState>
          ) : (
            <ul className="family__list">
              {data?.items.map((p) => (
                <li key={p.id} className="family__row">
                  <span className="family__who">
                    <strong>
                      {formatCurrency(p.amount)} · {CHANNEL[p.channel]}
                      {!status && <span className={`badge ${STATUS_BADGE[p.status]} online__badge`}>{p.status}</span>}
                    </strong>
                    <span className="muted">
                      {displayDate(p.paid_on)}
                      {p.payer ? ` · ${p.payer}` : ""}
                      {p.reference && p.channel !== "1bill" ? ` · “${p.reference}”` : ""}
                    </span>
                    {p.status === "matched" && p.student_name && (
                      <span className="online__for">
                        For {p.student_name}
                        {p.month ? ` · ${monthName(p.month)}` : ""}
                      </span>
                    )}
                    {p.status !== "matched" && p.note && <span className="online__why">{p.note}</span>}
                  </span>
                  {p.status === "unmatched" && (
                    <button type="button" className="btn primary small" onClick={() => setView({ match: p })}>
                      Match
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination data={data} onPageChange={setPage} />
        </div>
      )}
    </Drawer>
  );
}
