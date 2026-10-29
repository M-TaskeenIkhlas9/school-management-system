import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import Avatar from "../../components/Avatar.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import { fullName } from "../../lib/format.js";

const TERMS = ["First Term", "Mid Term", "Final Term", "Monthly Test"];

/**
 * Enter a whole class's marks at once, the way a teacher fills the award list: obtained marks out
 * of the paper's total. Percentage (and so the grade) is worked out; blank rows are skipped.
 */
export default function ClassResults({ students, classrooms, onDone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classrooms[0] ? String(classrooms[0].id) : "");
  const [term, setTerm] = useState(TERMS[0]);
  const [outOf, setOutOf] = useState("100");
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);

  const inClass = useMemo(
    () =>
      students
        .filter((s) => String(s.classroom_id) === classId)
        .sort((a, b) =>
          String(a.roll_number ?? "").localeCompare(String(b.roll_number ?? ""), undefined, { numeric: true })
        ),
    [students, classId]
  );
  const total = Number(outOf) || 0;
  const pct = (v) => (total && v !== "" && v !== undefined ? Math.round((Number(v) / total) * 1000) / 10 : null);
  const filled = inClass.filter((s) => marks[s.id] !== undefined && marks[s.id] !== "");
  const invalid = filled.some((s) => Number(marks[s.id]) < 0 || Number(marks[s.id]) > total);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.post("/results/generate", {
        classroom_id: Number(classId),
        term: term.trim(),
        results: filled.map((s) => ({
          student_id: s.id,
          total_score: Number(marks[s.id]),
          percentage: pct(marks[s.id]),
        })),
      });
      toast.success(`Saved ${saved.length} results for ${term}`);
      queryClient.invalidateQueries({ queryKey: keys.results });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
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
          <h2>Enter a class&apos;s results</h2>
          <p>
            Type each student&apos;s obtained marks; the percentage and grade are worked out. Leave a box empty to skip.
          </p>
        </div>
      </div>
      <div className="form-row">
        <label>
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` • ${c.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Term or test
          <input list="result-terms" value={term} onChange={(e) => setTerm(e.target.value)} required maxLength={50} />
          <datalist id="result-terms">
            {TERMS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <label>
          Total marks
          <input type="number" min="1" value={outOf} onChange={(e) => setOutOf(e.target.value)} required />
        </label>
      </div>

      {inClass.length === 0 ? (
        <EmptyState icon="students" title="No students in this class" />
      ) : (
        <ul className="marks-list">
          {inClass.map((s) => {
            const p = pct(marks[s.id]);
            const over = marks[s.id] !== undefined && marks[s.id] !== "" && Number(marks[s.id]) > total;
            return (
              <li key={s.id}>
                <span className="register-list__roll">{s.roll_number || "—"}</span>
                <Avatar name={fullName(s)} size={32} />
                <span className="register-list__name">{fullName(s)}</span>
                <input
                  type="number"
                  min="0"
                  max={total || undefined}
                  step="0.5"
                  inputMode="decimal"
                  aria-label={`Marks for ${fullName(s)}`}
                  className={over ? "is-invalid" : ""}
                  value={marks[s.id] ?? ""}
                  onChange={(e) => setMarks((m) => ({ ...m, [s.id]: e.target.value }))}
                />
                <span className="marks-list__of">/ {total || "—"}</span>
                <span
                  className={`marks-list__pct ${p === null ? "muted" : p >= 75 ? "is-good" : p >= 50 ? "is-mid" : "is-low"}`}
                >
                  {p === null ? "—" : `${p}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy || !filled.length || invalid}>
          {busy ? "Saving…" : `Save ${filled.length} results`}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        {invalid && <span className="danger-text">Some marks are more than the total.</span>}
      </div>
    </form>
  );
}
