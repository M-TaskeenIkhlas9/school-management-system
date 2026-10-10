import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useAttendancePage, useAttendanceSummary, useAttention } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatDate, fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";

const emptyForm = { student_id: "", day: "", status: "present" };

export default function AttendancePage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: summary } = useAttendanceSummary();
  const { data: attention } = useAttention({ enabled: can("reports:read") });
  const { students, classrooms, classIdOf } = useLookups();
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ classroom_id: "", status: "", page: 1 });
  const { data: records, isFetching } = useAttendancePage({ ...filters, pageSize: 20 });

  const setFilter = (name) => (e) => setFilters((f) => ({ ...f, [name]: e.target.value, page: 1 }));

  const create = useApiMutation((values) => api.post("/attendance", values), {
    invalidate: [keys.attendance, keys.attention],
    success: "Attendance saved",
  });

  const submit = (event) => {
    event.preventDefault();
    const studentId = Number(form.student_id);
    const classroomId = classIdOf(studentId);
    if (!classroomId) {
      toast.error("This student is not enrolled in a class yet. Assign a class on the Students page first.");
      return;
    }
    create.mutate(
      { student_id: studentId, classroom_id: classroomId, day: form.day || undefined, status: form.status },
      { onSuccess: () => setForm(emptyForm) }
    );
  };

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  return (
    <section className="section active">
      <PageHeader title="Attendance" subtitle="Daily tracking and insights." />
      {can("attendance:write") && (
        <div className="card form-card">
          <div className="card__title">
            <h4>Mark Attendance</h4>
            <span className="ai-pill">Daily</span>
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
            <input type="date" {...field("day")} />
            <select {...field("status")}>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save Attendance"}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="grid-2">
        <div className="card">
          <h4>Today</h4>
          <p>
            Attendance today:{" "}
            <strong>{summary?.today.rate === null || !summary ? "not marked yet" : `${summary.today.rate}%`}</strong>
          </p>
          <p>Records marked today: {summary?.today.marked ?? 0}</p>
          {can("reports:read") && <p>Students needing attention: {attention?.students?.length ?? 0}</p>}
        </div>
        <div className="card">
          <h4>By Class (all recorded days)</h4>
          {!summary?.by_class.length && <p className="muted">No attendance recorded yet.</p>}
          {summary?.by_class.map((c) => (
            <p key={c.classroom_id}>
              {c.class_name}: <strong>{c.rate}%</strong> <span className="muted">({c.records} records)</span>
            </p>
          ))}
        </div>
      </div>
      <div className="card table-card">
        <div className="card__title">
          <h5>Attendance Records</h5>
          <span>{isFetching ? "Loading…" : "Newest first"}</span>
        </div>
        <div className="filters">
          <select value={filters.classroom_id} onChange={setFilter("classroom_id")}>
            <option value="">All classes</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={filters.status} onChange={setFilter("status")}>
            <option value="">Any status</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </select>
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records?.items.length === 0 && (
              <tr>
                <td colSpan="4">No attendance records match.</td>
              </tr>
            )}
            {records?.items.map((row) => (
              <tr key={row.id}>
                <td>{row.student_name}</td>
                <td>{row.class_name}</td>
                <td>{formatDate(row.day)}</td>
                <td>
                  <span className={`badge ${badgeClass(row.status)}`}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination data={records} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
