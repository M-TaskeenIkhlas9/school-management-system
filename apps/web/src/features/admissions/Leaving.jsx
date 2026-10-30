import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import Drawer from "../../components/Drawer.jsx";
import { displayDate, formatCurrency } from "../../lib/format.js";

const CONDUCT = ["Very good", "Good", "Satisfactory"];

/** The School Leaving Certificate, laid out to print on one A4 page. */
export function LeavingCertificate({ c }) {
  const passedOut = c.status === "passed_out";
  const rows = [
    ["GR number", c.gr_number],
    ["Name of student", c.name],
    ["Father's name", c.father_name],
    ["Religion", c.religion],
    ["Date of birth", c.date_of_birth ? displayDate(c.date_of_birth) : null],
    ["B-Form number", c.b_form],
    ["Date of admission", c.admission_date ? displayDate(c.admission_date) : null],
    ["Class at admission", c.admission_class],
    ["Date of leaving", c.left_on ? displayDate(c.left_on) : null],
    [passedOut ? "Class passed" : "Class at leaving", c.leaving_class],
    ["Reason for leaving", c.reason],
    ["Conduct", c.conduct],
    ["School dues", c.dues > 0 ? `${formatCurrency(c.dues)} unpaid` : "Cleared"],
  ];
  return (
    <div className="slc print-area">
      <header className="slc__head">
        <strong className="slc__school">{c.school.name}</strong>
        {(c.school.address || c.school.phone) && (
          <span>{[c.school.address, c.school.phone].filter(Boolean).join(" · ")}</span>
        )}
        <h2>School Leaving Certificate</h2>
        <span className="slc__no">Certificate no. {String(c.slc_number).padStart(4, "0")}</span>
      </header>
      <dl className="slc__rows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="slc__text">
        Certified that the above particulars are correct according to the school&apos;s General Register.
      </p>
      <footer className="slc__sign">
        <span>Date of issue: {displayDate(new Date().toISOString().slice(0, 10))}</span>
        <span>Principal&apos;s signature &amp; stamp</span>
      </footer>
    </div>
  );
}

/** A former student's certificate, fetched again (to reprint from the register). */
export function CertificateDrawer({ studentId, onClose }) {
  const { data } = useQuery({
    queryKey: ["admissions", "certificate", studentId],
    queryFn: () => api.get(`/admissions/${studentId}/certificate`),
  });
  return (
    <Drawer title="School Leaving Certificate" onClose={onClose}>
      {data ? (
        <div className="payment">
          <LeavingCertificate c={data} />
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={() => window.print()}>
              Print certificate
            </button>
          </div>
        </div>
      ) : (
        <p className="muted">Loading…</p>
      )}
    </Drawer>
  );
}

/**
 * A student is leaving: record why and when, then print their certificate. Refused while fees are
 * unpaid, with the choice to leave anyway. "Added by mistake" removes the record instead.
 */
export function LeaveDrawer({ student, onClose, onRemove }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ left_on: "", reason: "", conduct: "Good" });
  const [dues, setDues] = useState(null); // the unpaid-fees message, once refused
  const [certificate, setCertificate] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const name = `${student.first_name} ${student.last_name}`.trim();

  const submit = async (e, ignoreDues = false) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const c = await api.post(`/admissions/${student.id}/leave`, {
        ...form,
        ...(ignoreDues ? { ignore_dues: true } : {}),
      });
      setCertificate(c);
      toast.success(`${name} has left. Certificate no. ${c.slc_number}`);
      for (const key of [keys.students, keys.dashboard, ["admissions"]]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    } catch (err) {
      if (err.code === "DUES_OUTSTANDING") setDues(err.message);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer title="Leaving the school" onClose={onClose}>
      <div className="payment">
        {certificate ? (
          <>
            <LeavingCertificate c={certificate} />
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={() => window.print()}>
                Print certificate
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h2>{name} is leaving</h2>
              <p className="muted">
                They come off the class lists but stay in the General Register, and you can print their School Leaving
                Certificate.
              </p>
            </div>
            <form className="payment__form" onSubmit={submit}>
              <label className="field-label">
                Date of leaving <span className="label-hint">leave empty for today</span>
                <input type="date" value={form.left_on} onChange={set("left_on")} />
              </label>
              <label className="field-label">
                Reason
                <input
                  value={form.reason}
                  maxLength={200}
                  onChange={set("reason")}
                  placeholder="e.g. Family moved to another city"
                />
              </label>
              <label className="field-label">
                Conduct
                <select value={form.conduct} onChange={set("conduct")}>
                  {CONDUCT.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {dues ? (
                <div className="slc__dues" role="alert">
                  <p>{dues}</p>
                  <div className="form-actions">
                    <button type="button" className="btn primary" disabled={busy} onClick={() => submit(null, true)}>
                      Leave anyway
                    </button>
                    <button type="button" className="btn ghost" onClick={onClose}>
                      Collect fees first
                    </button>
                  </div>
                </div>
              ) : (
                <div className="form-actions">
                  <button type="submit" className="btn primary btn--lg" disabled={busy}>
                    {busy ? "Saving…" : "Issue leaving certificate"}
                  </button>
                </div>
              )}
            </form>
            {onRemove && (
              <p className="muted slc__mistake">
                Added by mistake?{" "}
                <button type="button" className="btn link" onClick={onRemove}>
                  Remove the record instead
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
