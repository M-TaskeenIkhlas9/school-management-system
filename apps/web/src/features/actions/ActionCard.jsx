import { useState } from "react";
import { actionsApi } from "./api.js";
import { useToast } from "../../components/Toast.jsx";

const STATUS = {
  pending: ["Waiting for approval", "warning"],
  executing: ["Sending…", "info"],
  executed: ["Done", "success"],
  rejected: ["Rejected", "neutral"],
  failed: ["Failed", "danger"],
  expired: ["Expired", "neutral"],
};
const TYPE_LABEL = { send_parent_messages: "Message to parents", record_fee_payment: "Fee payment" };
const CHANNEL_LABEL = { email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

function MessagePreview({ preview }) {
  const [open, setOpen] = useState(0);
  return (
    <>
      <p className="muted action-card__meta">
        {preview.recipients.length} recipient(s)
        {preview.by_channel &&
          ` (${Object.entries(preview.by_channel)
            .map(
              ([c, n]) =>
                `${n.messages} ${CHANNEL_LABEL[c] ?? c}${n.segments > n.messages ? `, ${n.segments} SMS parts` : ""}`
            )
            .join(" · ")})`}
        {preview.estimated_cost && ` · estimated cost ${preview.estimated_cost}`} · click one to read the exact message
      </p>
      <ul className="action-card__recipients">
        {preview.recipients.map((r, i) => (
          <li key={r.guardian_id ?? i}>
            <button type="button" onClick={() => setOpen(open === i ? -1 : i)}>
              <span>
                {r.name}{" "}
                <span className="muted">
                  ({CHANNEL_LABEL[r.channel] ?? r.channel}: {r.to})
                </span>
              </span>
              <span className="muted">{r.student_names}</span>
            </button>
            {open === i && (
              <div className="action-card__message">
                {r.subject && <strong>{r.subject}</strong>}
                <pre>{r.body}</pre>
                {r.template_name && (
                  <p className="muted action-card__meta">
                    Sent with the approved WhatsApp template “{r.template_name}”.
                  </p>
                )}
                {r.segments > 1 && <p className="muted action-card__meta">{r.segments} SMS parts</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
      {preview.skipped?.length > 0 && (
        <p className="action-card__skipped">
          <strong>Can&apos;t be reached ({preview.skipped.length}):</strong>{" "}
          {preview.skipped.map((s) => `${s.student} — ${s.reason}`).join("; ")}
        </p>
      )}
      {preview.notes?.map((note) => (
        <p key={note} className="action-card__note">
          {note}
        </p>
      ))}
      {Object.entries(preview.channel_modes ?? {})
        .filter(([channel, mode]) => mode === "simulated" && preview.by_channel?.[channel] !== undefined)
        .map(([channel]) => (
          <p key={channel} className="action-card__note">
            {CHANNEL_LABEL[channel] ?? channel} is in test mode: messages are recorded in the outbox but not delivered.
          </p>
        ))}
    </>
  );
}

function PaymentPreview({ preview }) {
  return (
    <>
      <p className="muted action-card__meta">
        {preview.student} · {preview.amount} · outstanding before: {preview.outstanding_before}
      </p>
      <table className="md-table">
        <thead>
          <tr>
            <th>Due date</th>
            <th>Paid before</th>
            <th>Apply</th>
            <th>Status after</th>
          </tr>
        </thead>
        <tbody>
          {preview.allocations?.map((a) => (
            <tr key={a.fee_id ?? a.due_date}>
              <td>{a.due_date}</td>
              <td>
                {a.paid_before} / {a.amount_due}
              </td>
              <td>{a.apply}</td>
              <td>{a.status_after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** An action the assistant prepared, with its exact preview; approve, reject or edit when allowed. */
export default function ActionCard({ action: initial, onChange }) {
  const toast = useToast();
  const [action, setAction] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ subject: "", body: "" });

  const update = (next) => {
    setAction(next);
    onChange?.(next);
  };
  const run = async (fn, success) => {
    setBusy(true);
    try {
      update(await fn());
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(err.message);
      update(await actionsApi.get(action.id).catch(() => action));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const [label, tone] = STATUS[action.status] ?? [action.status, "neutral"];
  const preview = action.preview ?? {};
  const result = action.result ?? {};
  return (
    <div className={`action-card action-card--${action.status}`}>
      <div className="action-card__head">
        <span className="action-card__type">{TYPE_LABEL[action.type] ?? action.type}</span>
        <span className={`badge ${tone}`}>{label}</span>
      </div>
      <div className="action-card__summary">{action.summary}</div>
      <div className="muted action-card__meta">
        Prepared by {action.requested_by_name ?? "you"}
        {action.decided_by_name ? ` · decided by ${action.decided_by_name}` : ""}
      </div>

      {editing ? (
        <div className="action-card__editor">
          <label>
            Subject
            <input value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))} />
          </label>
          <label>
            Message (placeholders like {"{{guardian_name}}"} and {"{{student_names}}"} are filled per parent)
            <textarea rows={6} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
          </label>
          <div className="action-card__buttons">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={async () => {
                if (await run(() => actionsApi.edit(action.id, draft), "Message updated")) setEditing(false);
              }}
            >
              Save changes
            </button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : action.type === "record_fee_payment" ? (
        <PaymentPreview preview={preview} />
      ) : preview.recipients ? (
        <MessagePreview preview={preview} />
      ) : null}

      {result.queued !== undefined && (
        <p className="muted action-card__meta">
          {result.queued} queued
          {result.delivered !== undefined ? ` · ${result.delivered} sent · ${result.failed} failed` : ""}
          {result.send_after && new Date(result.send_after) > new Date()
            ? ` · held until ${new Date(result.send_after).toLocaleString()} (quiet hours)`
            : ""}
        </p>
      )}
      {result.reason && <p className="muted action-card__meta">Reason: {result.reason}</p>}

      {action.status === "pending" && !editing && (
        <div className="action-card__buttons">
          {action.can_approve ? (
            <>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => run(() => actionsApi.approve(action.id), "Approved")}
              >
                {busy ? "Working…" : "Approve"}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={busy}
                onClick={() => run(() => actionsApi.reject(action.id), "Rejected")}
              >
                Reject
              </button>
            </>
          ) : (
            <span className="muted">Waiting for someone with permission (e.g. the principal) to approve.</span>
          )}
          {action.can_edit && (
            <button
              type="button"
              className="btn link"
              onClick={() => {
                setDraft({ subject: preview.subject_template ?? "", body: preview.body_template ?? "" });
                setEditing(true);
              }}
            >
              Edit message
            </button>
          )}
        </div>
      )}
    </div>
  );
}
