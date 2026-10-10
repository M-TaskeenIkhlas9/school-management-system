import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useResultsPage } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Pagination from "../../components/Pagination.jsx";

const emptyForm = { student_id: "", term: "", total_score: "", percentage: "", remarks: "" };

export default function ResultsPage() {
  const toast = useToast();
  const { students, classrooms, classIdOf } = useLookups();
  const [form, setForm] = useState(emptyForm);
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
      { onSuccess: () => setForm(emptyForm) }
    );
  };

  return (
    <section className="section active">
      <PageHeader title="Results & Report Cards" subtitle="Enter marks; grades are calculated automatically." />
      <div className="card form-card">
        <div className="card__title">
          <h4>Add Result</h4>
          <span className="ai-pill">Term</span>
        </div>
        <form className="form-row" onSubmit={submit}>
          <select required {...field("student_id")}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {fullName(s)}
              </option>
            ))}
          </select>
          <input type="text" placeholder="Term (e.g., Term 1)" required {...field("term")} />
          <input type="number" min="0" placeholder="Total score" required {...field("total_score")} />
          <input type="number" min="0" max="100" placeholder="Percentage" required {...field("percentage")} />
          <input type="text" placeholder="Remarks" {...field("remarks")} />
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save Result"}
            </button>
          </div>
        </form>
      </div>
      <div className="card table-card">
        <div className="filters">
          <select value={filters.classroom_id} onChange={(e) => setFilters({ classroom_id: e.target.value, page: 1 })}>
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
                <td colSpan="6">No results match.</td>
              </tr>
            )}
            {results?.items.map((row) => (
              <tr key={row.id}>
                <td>{row.student_name}</td>
                <td>{row.class_name}</td>
                <td>{row.term}</td>
                <td>{row.percentage}%</td>
                <td>
                  <span className="badge primary">{row.grade}</span>
                </td>
                <td>{row.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={results} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
