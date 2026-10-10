import { useMemo, useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useAttendance, useAttention, useDashboard } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatDate, fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";

const emptyForm = { student_id: "", day: "", status: "present" };
const attended = (status) => status === "present" || status === "late";

export default function AttendancePage() {
  const toast = useToast();
  const { data: entries = [] } = useAttendance();
  const { data: stats } = useDashboard();
  const { data: attention } = useAttention();
  const { students, studentName, classroomName, classIdOf } = useLookups();
  const [form, setForm] = useState(emptyForm);

  // Attendance rate per class over all recorded days.
  const classRates = useMemo(() => {
    const byClass = new Map();
    for (const row of entries) {
      const c = byClass.get(row.classroom_id) || { total: 0, attended: 0 };
      c.total++;
      if (attended(row.status)) c.attended++;
      byClass.set(row.classroom_id, c);
    }
    return [...byClass.entries()]
      .map(([classroomId, c]) => ({ classroomId, rate: Math.round((c.attended / c.total) * 100) }))
      .sort((a, b) => b.rate - a.rate);
  }, [entries]);

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
      <div className="grid-2">
        <div className="card">
          <h4>Daily Summary</h4>
          <p>
            Attendance today: <strong>{stats?.todayAttendance ?? 0}%</strong>
          </p>
          <p>Students needing attention: {attention?.students?.length ?? 0}</p>
        </div>
        <div className="card">
          <h4>By Class</h4>
          {classRates.length === 0 && <p className="muted">No attendance recorded yet.</p>}
          {classRates.map((c) => (
            <p key={c.classroomId}>
              {classroomName(c.classroomId)}: <strong>{c.rate}%</strong>
            </p>
          ))}
        </div>
      </div>
      <div className="card table-card">
        <div className="card__title">
          <h5>Recent Attendance</h5>
          <span>Latest entries</span>
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
            {entries.length === 0 && (
              <tr>
                <td colSpan="4">No attendance marked yet.</td>
              </tr>
            )}
            {entries.slice(0, 20).map((row) => (
              <tr key={row.id}>
                <td>{studentName(row.student_id)}</td>
                <td>{classroomName(row.classroom_id)}</td>
                <td>{formatDate(row.day)}</td>
                <td>
                  <span className={`badge ${badgeClass(row.status)}`}>{row.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
