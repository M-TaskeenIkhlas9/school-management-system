import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import Drawer from "../../components/Drawer.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { bise, ordinal } from "./grades.js";

/** A printable report card for one student's term result. */
export default function ReportCard({ resultId, onClose }) {
  const { school } = useAuth();
  const { data: card, error } = useQuery({
    queryKey: ["results", resultId, "report-card"],
    queryFn: () => api.get(`/results/${resultId}/report-card`),
  });

  return (
    <Drawer title="Report card" onClose={onClose}>
      {error && <p className="danger-text">{error.message}</p>}
      {!card && !error && <p className="muted">Loading…</p>}
      {card && (
        <>
          <div className="report print-area">
            <header className="report__head">
              <strong className="report__school">{school?.name}</strong>
              {school?.address && <span>{school.address}</span>}
              <span className="report__title">Result card · {card.term}</span>
            </header>
            <dl className="report__who">
              <div>
                <dt>Student</dt>
                <dd>{card.student.name}</dd>
              </div>
              <div>
                <dt>Father / guardian</dt>
                <dd>{card.student.guardian_name || "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{card.student.class_name}</dd>
              </div>
              <div>
                <dt>Roll no.</dt>
                <dd>{card.student.roll_number || "—"}</dd>
              </div>
            </dl>
            {card.subjects.length ? (
              <table className="report__table">
                <thead>
                  <tr>
                    <th>Subject</th>
                    <th>Total</th>
                    <th>Obtained</th>
                    <th>%</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {card.subjects.map((s) => (
                    <tr key={s.subject} className={s.passed ? "" : "is-fail"}>
                      <td>{s.subject}</td>
                      <td>{s.total}</td>
                      <td>{s.obtained}</td>
                      <td>{s.percentage}%</td>
                      <td>{s.grade}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{card.max_marks}</td>
                    <td>{card.obtained}</td>
                    <td>{card.percentage}%</td>
                    <td>{card.grade}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <p className="muted">
                Only an overall result was entered ({card.percentage}%). Enter marks on the class result sheet to show
                subjects.
              </p>
            )}
            <div className="report__summary">
              <div>
                <span>Percentage</span>
                <strong>{card.percentage}%</strong>
              </div>
              <div>
                <span>Grade</span>
                <strong className={`grade grade--${bise(card.percentage).tone}`}>{card.grade}</strong>
              </div>
              <div>
                <span>Position</span>
                <strong>{card.position ? `${ordinal(card.position)} of ${card.out_of}` : "—"}</strong>
              </div>
              <div>
                <span>Attendance</span>
                <strong>{card.attendance_rate}%</strong>
              </div>
              <div>
                <span>Result</span>
                <strong className={card.passed ? "text-ok" : "danger-text"}>{card.passed ? "Pass" : "Fail"}</strong>
              </div>
            </div>
            {card.remarks && <p className="report__remarks">Remarks: {card.remarks}</p>}
            <div className="report__signs">
              <span>Class teacher</span>
              <span>Principal</span>
              <span>Parent</span>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={() => window.print()}>
              Print report card
            </button>
          </div>
        </>
      )}
    </Drawer>
  );
}
