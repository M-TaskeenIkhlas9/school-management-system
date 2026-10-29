import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useResultsPage, useTrends } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import CountUp from "../../components/CountUp.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";
import ResultSheet from "./ResultSheet.jsx";
import ReportCard from "./ReportCard.jsx";
import { ordinal } from "./grades.js";

const gradeTone = (g) => {
  const first = String(g || "").toUpperCase()[0];
  return first === "A" ? "good" : first === "B" ? "ok" : first === "C" ? "mid" : "low";
};

const emptyForm = { student_id: "", term: "", total_score: "", percentage: "", remarks: "" };

export default function ResultsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { students, classrooms, classIdOf } = useLookups();
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [classEntry, setClassEntry] = useState(false);
  const [cardId, setCardId] = useState(null);
  const [editing, setEditing] = useState(null); // { id, percentage, total_score, remarks }
  const canWrite = can("results:write");
  const saveEdit = useApiMutation(({ id, ...changes }) => api.put(`/results/${id}`, changes), {
    invalidate: [keys.results],
    success: (r) => `Result updated (grade ${r.grade})`,
  });
  const removeResult = useApiMutation((id) => api.del(`/results/${id}`), {
    invalidate: [keys.results],
    success: "Result deleted",
  });
  const [filters, setFilters] = useState({ classroom_id: "", page: 1 });
  const { data: results } = useResultsPage({ ...filters, pageSize: 20 });
  const { data: trends } = useTrends();
  const terms = trends?.results_by_term ?? [];
  const latest = terms.at(-1);
  const previous = terms.at(-2);
  const best = terms.reduce((top, t) => (!top || t.value > top.value ? t : top), null);

  const create = useApiMutation((values) => api.post("/results", values), {
    invalidate: [keys.results, keys.attention],
    success: (r) => `Result saved (grade ${r.grade})`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    const studentId = Number(form.student_id);
    const classroomId = classIdOf(studentId);
    if (!classroomId) {
      toast.error("This student is not enrolled in a class yet. Assign a class on the Students page first.");
      return;
    }
    create.mutate(
      { ...form, student_id: studentId, classroom_id: classroomId },
      {
        onSuccess: () => {
          setForm(emptyForm);
          setOpen(false);
        },
      }
    );
  };

  return (
    <section className="section">
      <PageHeader
        icon="results"
        tone="violet"
        title="Results"
        subtitle="Term results for each student. Grades are worked out from the percentage."
      >
        {canWrite && !open && !classEntry && (
          <>
            <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
              Add one result
            </button>
            <button type="button" className="btn primary" onClick={() => setClassEntry(true)}>
              <Icon name="plus" size={18} strokeWidth={2} /> Class result sheet
            </button>
          </>
        )}
      </PageHeader>
      <StatRow>
        <StatCard
          tone="violet"
          icon="results"
          label={latest ? `Average, ${latest.label}` : "Latest term average"}
          delta={
            latest && previous
              ? {
                  dir: latest.value > previous.value ? "up" : latest.value < previous.value ? "down" : "flat",
                  text: `${latest.value - previous.value > 0 ? "+" : ""}${latest.value - previous.value} pts vs ${previous.label}`,
                }
              : undefined
          }
        >
          {latest ? <CountUp value={latest.value} format={(n) => `${Math.round(n)}%`} /> : "—"}
        </StatCard>
        <StatCard tone="green" icon="trendUp" label="Best term" note={best ? best.label : "No terms yet"}>
          {best ? `${best.value}%` : "—"}
        </StatCard>
        <StatCard tone="blue" icon="exams" label="Results recorded" note={`${terms.length} terms`}>
          <CountUp value={results?.total ?? 0} />
        </StatCard>
      </StatRow>

      {canWrite && classEntry && <ResultSheet classrooms={classrooms} onDone={() => setClassEntry(false)} />}
      {canWrite && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Add one result</h2>
          </div>
          <form className="form-row" onSubmit={submit}>
            <label>
              Student
              <select required autoFocus {...field("student_id")}>
                <option value="">Choose a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Term
              <input type="text" placeholder="Term 1" required {...field("term")} />
            </label>
            <label>
              Total marks
              <input type="number" min="0" required {...field("total_score")} />
            </label>
            <label>
              Percentage
              <input type="number" min="0" max="100" required {...field("percentage")} />
            </label>
            <label>
              Remarks <span className="label-hint">optional</span>
              <input type="text" {...field("remarks")} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save result"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="card table-card">
        <div className="filters">
          <select
            value={filters.classroom_id}
            onChange={(e) => setFilters({ classroom_id: e.target.value, page: 1 })}
            aria-label="Class"
          >
            <option value="">All classes</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Term</th>
              <th>Percentage</th>
              <th>Grade</th>
              <th>Position</th>
              <th>Remarks</th>
              {canWrite && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {results?.items.length === 0 && (
              <tr>
                <td colSpan={canWrite ? 8 : 7}>
                  <EmptyState icon="results" title="No results match">
                    Try another class, or enter the first result.
                  </EmptyState>
                </td>
              </tr>
            )}
            {results?.items.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="student-cell">
                    <Avatar name={row.student_name} size={34} />
                    <span className="student-name">{row.student_name}</span>
                  </div>
                </td>
                <td>
                  <span className="badge neutral">{row.class_name}</span>
                </td>
                <td>{row.term}</td>
                <td>
                  <div className="meter">
                    <span className="meter__track">
                      <span
                        className={`meter__fill is-${row.percentage >= 75 ? "good" : row.percentage >= 50 ? "mid" : "low"}`}
                        style={{ width: `${row.percentage}%` }}
                      />
                    </span>
                    <strong>{row.percentage}%</strong>
                  </div>
                </td>
                <td>
                  <span className={`grade grade--${gradeTone(row.grade)}`}>{row.grade}</span>
                </td>
                <td className="nowrap">
                  {row.position ? (
                    <>
                      <strong>{ordinal(Number(row.position))}</strong> <span className="muted">of {row.out_of}</span>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {editing?.id === row.id ? (
                    <input
                      value={editing.remarks ?? ""}
                      aria-label="Remarks"
                      onChange={(e) => setEditing((x) => ({ ...x, remarks: e.target.value }))}
                    />
                  ) : (
                    row.remarks || <span className="muted">—</span>
                  )}
                </td>
                {canWrite && (
                  <td>
                    {editing?.id === row.id ? (
                      <div className="row-editor">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          aria-label="Percentage"
                          value={editing.percentage}
                          onChange={(e) => setEditing((x) => ({ ...x, percentage: e.target.value }))}
                        />
                        <button
                          type="button"
                          className="btn primary small"
                          disabled={saveEdit.isPending}
                          onClick={() =>
                            saveEdit.mutate(
                              { id: row.id, percentage: Number(editing.percentage), remarks: editing.remarks ?? "" },
                              { onSuccess: () => setEditing(null) }
                            )
                          }
                        >
                          Save
                        </button>
                        <button type="button" className="btn link" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="row-actions">
                        <button type="button" className="btn ghost small" onClick={() => setCardId(row.id)}>
                          Report card
                        </button>
                        {Number(row.subject_count) === 0 && (
                          <button
                            type="button"
                            className="btn link"
                            onClick={() => setEditing({ id: row.id, percentage: row.percentage, remarks: row.remarks })}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-btn-danger"
                          aria-label={`Delete ${row.student_name}'s ${row.term} result`}
                          title="Delete"
                          onClick={() =>
                            window.confirm(`Delete ${row.student_name}'s ${row.term} result?`) &&
                            removeResult.mutate(row.id)
                          }
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={results} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
      {cardId && <ReportCard resultId={cardId} onClose={() => setCardId(null)} />}
    </section>
  );
}
