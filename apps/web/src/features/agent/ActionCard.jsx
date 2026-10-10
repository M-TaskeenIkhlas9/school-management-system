import { useState } from "react";

const TYPE_LABELS = {
  send_guardian_emails: "Send emails",
  add_student: "Add student",
  record_fee_payment: "Record payment",
  create_exam: "Save exam",
};

const STATUS = {
  pending: { label: "Waiting for approval", tone: "warning" },
  executing: { label: "Running…", tone: "info" },
  executed: { label: "Done", tone: "success" },
  rejected: { label: "Rejected", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
};

function EmailPreview({ preview, result }) {
  const [openIndex, setOpenIndex] = useState(0);
  const emails = preview.emails || [];
  return (
    <div className="action-body">
      {preview.delivery_mode === "simulated" && (
        <p className="action-note warning">
          SMTP is not configured: approving will record these emails but <strong>not deliver</strong> them.
        </p>
      )}
      {preview.redirect_to && (
        <p className="action-note info">
          Test mode: every email will go to {preview.redirect_to} instead of the parents.
        </p>
      )}
      <p className="action-meta">{emails.length} recipient(s) · click one to read the exact email</p>
      <ul className="email-list">
        {emails.map((e, i) => (
          <li key={i} className={openIndex === i ? "open" : ""}>
            <button type="button" className="email-row" onClick={() => setOpenIndex(openIndex === i ? -1 : i)}>
              <span className="email-to">
                {e.to_name} &lt;{e.to}&gt;
              </span>
              <span className="email-student">{e.student_name}</span>
            </button>
            {openIndex === i && (
              <div className="email-preview">
                <div className="email-subject">Subject: {e.subject}</div>
                <pre className="email-text">{e.body}</pre>
              </div>
            )}
          </li>
        ))}
      </ul>
      {preview.skipped?.length > 0 && (
        <div className="action-skipped">
          <strong>Skipped ({preview.skipped.length}):</strong>{" "}
          {preview.skipped.map((s) => `${s.student_name} — ${s.reason}`).join("; ")}
        </div>
      )}
      {result && (
        <p className="action-meta">
          Result: {result.sent} sent, {result.simulated} simulated, {result.failed} failed
        </p>
      )}
    </div>
  );
}

function StudentPreview({ preview }) {
  const s = preview.student || {};
  return (
    <div className="action-body">
      <dl className="action-fields">
        <dt>Name</dt>
        <dd>
          {s.first_name} {s.last_name}
        </dd>
        <dt>Class</dt>
        <dd>{preview.class_name}</dd>
        {s.roll_number && (
          <>
            <dt>Roll no.</dt>
            <dd>{s.roll_number}</dd>
          </>
        )}
        <dt>Guardian</dt>
        <dd>{s.guardian_name || "—"}</dd>
        <dt>Guardian email</dt>
        <dd>{s.guardian_email || "—"}</dd>
        {s.guardian_phone && (
          <>
            <dt>Guardian phone</dt>
            <dd>{s.guardian_phone}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

function PaymentPreview({ preview }) {
  return (
    <div className="action-body">
      <p className="action-meta">
        {preview.student_name} · payment {preview.amount} · outstanding before {preview.outstanding_before}
      </p>
      <table className="md-table">
        <thead>
          <tr>
            <th>Fee month</th>
            <th>Due date</th>
            <th>Paid before</th>
            <th>Apply</th>
            <th>Status after</th>
          </tr>
        </thead>
        <tbody>
          {(preview.allocations || []).map((a) => (
            <tr key={a.fee_id}>
              <td>{a.month || "—"}</td>
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
    </div>
  );
}

function ExamPreview({ preview }) {
  return (
    <div className="action-body">
      <p className="action-meta">
        {preview.class_name} · {preview.subject} · {preview.total_marks} marks
      </p>
      <ol className="exam-questions">
        {(preview.questions || []).map((q, i) => (
          <li key={i}>
            {q.question} <span className="muted">({q.marks || 5} marks)</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const PREVIEWS = {
  send_guardian_emails: EmailPreview,
  add_student: StudentPreview,
  record_fee_payment: PaymentPreview,
  create_exam: ExamPreview,
};

export default function ActionCard({ action, busy, onDecide }) {
  const status = STATUS[action.status] || { label: action.status, tone: "neutral" };
  const Preview = PREVIEWS[action.type];
  return (
    <div className={`action-card status-${action.status}`}>
      <div className="action-head">
        <span className="action-type">{TYPE_LABELS[action.type] || action.type}</span>
        <span className={`badge ${status.tone}`}>{status.label}</span>
      </div>
      <div className="action-summary">{action.summary}</div>
      {Preview && action.preview && <Preview preview={action.preview} result={action.result} />}
      {action.error && <p className="action-note danger">{action.error}</p>}
      {action.status === "pending" && (
        <div className="action-buttons">
          <button type="button" className="btn primary" disabled={busy} onClick={() => onDecide(action.id, "approve")}>
            {busy ? "Working…" : "Approve"}
          </button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => onDecide(action.id, "reject")}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}
