import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Icon from "../../app/Icon.jsx";
import { bise, TERMS } from "./grades.js";

/**
 * The class award list: students down the side, subjects across (each with its total marks), the
 * way it is kept on paper. Totals, percentage and grade update as marks are typed; blank boxes are
 * skipped. Opening a class and term again shows what was saved, so it can be corrected.
 */
export default function ResultSheet({ classrooms, onDone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classrooms[0] ? String(classrooms[0].id) : "");
  const [term, setTerm] = useState(TERMS[0]);
  const [subjects, setSubjects] = useState([]);
  const [marks, setMarks] = useState({});
  const [busy, setBusy] = useState(false);

  const { data: sheet, isFetching } = useQuery({
    queryKey: ["results", "sheet", classId, term],
    queryFn: () => api.get(`/results/sheet?classroom_id=${classId}&term=${encodeURIComponent(term)}`),
    enabled: Boolean(classId && term.trim()),
  });

  useEffect(() => {
    if (!sheet) return;
    setSubjects(sheet.subjects.length ? sheet.subjects : [{ name: "English", total: 100 }]);
    setMarks(Object.fromEntries(sheet.students.map((s) => [s.student_id, { ...s.marks }])));
  }, [sheet]);

  const students = sheet?.students ?? [];
  const setMark = (studentId, subject, value) =>
    setMarks((m) => ({ ...m, [studentId]: { ...m[studentId], [subject]: value } }));
  const renameSubject = (i, name) => {
    const old = subjects[i].name;
    setSubjects((list) => list.map((s, j) => (j === i ? { ...s, name } : s)));
    setMarks((m) =>
      Object.fromEntries(
        Object.entries(m).map(([id, row]) => {
          const { [old]: value, ...rest } = row;
          return [id, value === undefined ? rest : { ...rest, [name]: value }];
        })
      )
    );
  };

  const rowTotals = (studentId) => {
    const row = marks[studentId] ?? {};
    let obtained = 0;
    let max = 0;
    let any = false;
    for (const s of subjects) {
      const v = row[s.name];
      if (v === undefined || v === "" || v === null) continue;
      any = true;
      obtained += Number(v);
      max += Number(s.total) || 0;
    }
    return any && max ? { obtained, max, pct: Math.round((obtained / max) * 1000) / 10 } : null;
  };

  const overLimit = students.some((st) =>
    subjects.some((s) => {
      const v = marks[st.student_id]?.[s.name];
      return v !== undefined && v !== "" && Number(v) > Number(s.total);
    })
  );
  const filled = students.filter((s) => rowTotals(s.student_id)).length;
  const badSubjects =
    subjects.some((s) => !s.name.trim() || !(Number(s.total) > 0)) ||
    new Set(subjects.map((s) => s.name.trim().toLowerCase())).size !== subjects.length;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post("/results/sheet", {
        classroom_id: Number(classId),
        term: term.trim(),
        subjects: subjects.map((s) => ({ name: s.name.trim(), total: Number(s.total) })),
        rows: students.map((s) => ({
          student_id: s.student_id,
          marks: Object.fromEntries(subjects.map((sub) => [sub.name.trim(), marks[s.student_id]?.[sub.name] ?? ""])),
        })),
      });
      toast.success(`Saved ${r.saved} results for ${term}`);
      queryClient.invalidateQueries({ queryKey: keys.results });
      queryClient.invalidateQueries({ queryKey: ["results", "sheet"] });
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
          <h2>Class result sheet</h2>
          <p>Type each student&apos;s marks per subject. Totals, percentage and grade work themselves out.</p>
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
          <input list="sheet-terms" value={term} onChange={(e) => setTerm(e.target.value)} required maxLength={50} />
          <datalist id="sheet-terms">
            {[...new Set([...(sheet?.terms ?? []), ...TERMS])].map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
      </div>

      {students.length === 0 ? (
        <EmptyState icon="students" title={isFetching ? "Loading…" : "No students in this class"} />
      ) : (
        <div className="sheet-wrap">
          <table className="sheet">
            <thead>
              <tr>
                <th className="sheet__name">Student</th>
                {subjects.map((s, i) => (
                  <th key={i} className="sheet__subject">
                    <input
                      aria-label="Subject"
                      value={s.name}
                      onChange={(e) => renameSubject(i, e.target.value)}
                      placeholder="Subject"
                    />
                    <span className="sheet__out-of">
                      out of
                      <input
                        type="number"
                        min="1"
                        aria-label={`Total marks for ${s.name}`}
                        value={s.total}
                        onChange={(e) =>
                          setSubjects((list) => list.map((x, j) => (j === i ? { ...x, total: e.target.value } : x)))
                        }
                      />
                    </span>
                    {subjects.length > 1 && (
                      <button
                        type="button"
                        className="sheet__remove"
                        aria-label={`Remove ${s.name}`}
                        onClick={() => setSubjects((list) => list.filter((_, j) => j !== i))}
                      >
                        ×
                      </button>
                    )}
                  </th>
                ))}
                <th className="sheet__add">
                  <button
                    type="button"
                    className="btn link"
                    onClick={() => setSubjects((list) => [...list, { name: "", total: 100 }])}
                  >
                    <Icon name="plus" size={16} /> Subject
                  </button>
                </th>
                <th>Total</th>
                <th>%</th>
                <th>Grade</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const t = rowTotals(st.student_id);
                const g = t ? bise(t.pct) : null;
                return (
                  <tr key={st.student_id}>
                    <td className="sheet__name">
                      <span className="register-list__roll">{st.roll_number || "—"}</span> {st.student_name}
                    </td>
                    {subjects.map((s, i) => {
                      const v = marks[st.student_id]?.[s.name] ?? "";
                      const over = v !== "" && Number(v) > Number(s.total);
                      const failing = v !== "" && !over && (Number(v) / Number(s.total)) * 100 < 33;
                      return (
                        <td key={i}>
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            inputMode="decimal"
                            aria-label={`${st.student_name} ${s.name}`}
                            className={`sheet__mark ${over ? "is-invalid" : failing ? "is-fail" : ""}`}
                            title={failing ? "Below the 33% pass mark" : undefined}
                            value={v}
                            onChange={(e) => setMark(st.student_id, s.name, e.target.value)}
                          />
                        </td>
                      );
                    })}
                    <td />
                    <td className="sheet__num">{t ? `${t.obtained}/${t.max}` : "—"}</td>
                    <td className="sheet__num">{t ? `${t.pct}%` : "—"}</td>
                    <td>{g ? <span className={`grade grade--${g.tone}`}>{g.grade}</span> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy || !filled || overLimit || badSubjects}>
          {busy ? "Saving…" : `Save results (${filled} students)`}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        {overLimit && <span className="danger-text">Some marks are more than the subject&apos;s total.</span>}
        {badSubjects && <span className="danger-text">Every subject needs a different name and a total.</span>}
      </div>
    </form>
  );
}
