import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useResultsPage } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";

const emptyForm = { student_id: "", term: "", total_score: "", percentage: "", remarks: "" };

export default function ResultsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const { students, classrooms, classIdOf } = useLookups();
  const [form, setForm] = useState(emptyForm);
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ classroom_id: "", page: 1 });
  const { data: results } = useResultsPage({ ...filters, pageSize: 20 });

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
      <PageHeader title="Results" subtitle="Term results for each student. Grades are worked out from the percentage.">
        {can("results:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Enter a result
          </button>
        )}
      </PageHeader>
      {can("results:write") && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Enter a result</h2>
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
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {results?.items.length === 0 && (
              <tr>
                <td colSpan="6" className="muted">
                  No results match.
                </td>
              </tr>
            )}
            {results?.items.map((row) => (
              <tr key={row.id}>
                <td>{row.student_name}</td>
                <td>{row.class_name}</td>
                <td>{row.term}</td>
                <td>{row.percentage}%</td>
                <td>
                  <span className="grade">{row.grade}</span>
                </td>
                <td>{row.remarks || <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={results} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
