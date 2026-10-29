import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../api/client.js";
import Drawer from "../../components/Drawer.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { displayDate, formatCurrency } from "../../lib/format.js";

const COPIES = ["Bank copy", "School copy", "Parent copy"];
const monthName = (ym) =>
  ym
    ? new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${ym}-01T00:00:00Z`)
      )
    : "";

/** One fee challan in three parts (bank, school, parent), as Pakistani schools print them. */
function Challan({ c, school }) {
  const fine = Number(school?.late_fine) || 0;
  return (
    <div className="challan">
      {COPIES.map((copy) => (
        <div key={copy} className="challan__copy">
          <div className="challan__head">
            <strong>{school?.name}</strong>
            <span>{copy}</span>
          </div>
          <p className="challan__bank">{school?.bank_details || "Pay at the school office"}</p>
          <dl>
            <div>
              <dt>Challan no.</dt>
              <dd>{String(c.id).padStart(6, "0")}</dd>
            </div>
            <div>
              <dt>Student</dt>
              <dd>{c.student_name}</dd>
            </div>
            <div>
              <dt>Father / guardian</dt>
              <dd>{c.guardian_name || "—"}</dd>
            </div>
            <div>
              <dt>Class · Roll no.</dt>
              <dd>
                {c.class_name || "—"}
                {c.section ? ` (${c.section})` : ""} · {c.roll_number || "—"}
              </dd>
            </div>
            <div>
              <dt>Fee for</dt>
              <dd>{c.month ? monthName(c.month) : "—"}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{displayDate(c.due_date)}</dd>
            </div>
            <div className="challan__amount">
              <dt>Payable by due date</dt>
              <dd>{formatCurrency(c.payable)}</dd>
            </div>
            {fine > 0 && (
              <div>
                <dt>After due date</dt>
                <dd>{formatCurrency(c.payable + fine)}</dd>
              </div>
            )}
          </dl>
          <div className="challan__sign">Received by / stamp</div>
        </div>
      ))}
    </div>
  );
}

/**
 * Print fee challans: for one fee (feeId) or a month's unpaid fees for a class or the whole school.
 */
export default function Challans({ classrooms, feeId, onClose }) {
  const { school } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [classId, setClassId] = useState("");
  const query = feeId ? `fee_id=${feeId}` : `month=${month}${classId ? `&classroom_id=${classId}` : ""}`;
  const { data: challans, isFetching } = useQuery({
    queryKey: ["fees", "challans", query],
    queryFn: () => api.get(`/fees/challans?${query}`),
  });

  return (
    <Drawer title="Fee challans" onClose={onClose}>
      <div className="challans">
        <h2>Fee challans</h2>
        {!feeId && (
          <div className="form-row">
            <label>
              Month
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </label>
            <label>
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">All classes</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.section ? ` • ${c.section}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {(!school?.bank_details || /sample/i.test(school.bank_details)) && (
          <p className="register-card__note">
            {school?.bank_details
              ? "These challans show sample bank details. "
              : "No bank account is set, so challans say to pay at the school office. "}
            The principal can change this on <Link to="/settings">Settings</Link>.
          </p>
        )}
        {challans?.length === 0 && (
          <EmptyState icon="fees" title={isFetching ? "Loading…" : "Nothing to print"}>
            {!isFetching && "No unpaid fees for that month. Bill the month first, or pick another one."}
          </EmptyState>
        )}
        {challans?.length > 0 && (
          <>
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={() => window.print()}>
                Print {challans.length} {challans.length === 1 ? "challan" : "challans"}
              </button>
            </div>
            <div className="print-area challans__list">
              {challans.map((c) => (
                <Challan key={c.id} c={c} school={school} />
              ))}
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
