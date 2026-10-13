import { useState } from "react";
import { api } from "../../api/client.js";
import {
  keys,
  useApiMutation,
  useAttendancePage,
  useAttendanceSummary,
  useAttention,
  useDashboard,
} from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, displayDate, fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import Pagination from "../../components/Pagination.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import Avatar from "../../components/Avatar.jsx";

const STATUSES = [
  ["present", "Present"],
  ["late", "Late"],
  ["absent", "Absent"],
];

const emptyForm = { student_id: "", day: "", status: "present" };

export default function AttendancePage() {
  const { can } = useAuth();
  const toast = useToast();
  const { data: summary } = useAttendanceSummary();
  const { data: stats = {} } = useDashboard();
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

  const today = summary?.today;
  return (
    <section className="section">
      <PageHeader
        icon="attendance"
        tone="green"
        title="Attendance"
        subtitle="Mark who is present, late or absent, and see how each class is doing."
      />

      <StatRow>
        <StatCard
          tone="green"
          icon="attendance"
          label="Present today"
          note={today?.marked ? `${today.marked} marks so far` : "Not marked yet"}
        >
          {today?.rate === null || today?.rate === undefined ? (
            "—"
          ) : (
            <CountUp value={today.rate} format={(n) => `${Math.round(n)}%`} />
          )}
        </StatCard>
        <StatCard tone="blue" icon="chart" label="Last 30 days" note="average share present">
          {stats.attendance30 === null || stats.attendance30 === undefined ? (
            "—"
          ) : (
            <CountUp value={stats.attendance30} format={(n) => `${n.toFixed(1)}%`} />
          )}
        </StatCard>
        <StatCard tone="violet" icon="classes" label="Classes recorded" note="with any attendance">
          <CountUp value={summary?.by_class?.length ?? 0} />
        </StatCard>
        {can("reports:read") && (
          <StatCard tone="rose" icon="predict" label="Flagged students" note="low attendance or marks">
            <CountUp value={attention?.students?.length ?? 0} />
          </StatCard>
        )}
      </StatRow>

      <div className="grid-2">
        {can("attendance:write") && (
          <div className="card form-card">
            <div className="card__head">
              <div>
                <h2>Mark attendance</h2>
                <p>Leave the date empty for today.</p>
              </div>
            </div>
            <form className="form-row" onSubmit={submit}>
              <label>
                Student
                <select required {...field("student_id")}>
                  <option value="">Choose a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {fullName(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" {...field("day")} />
              </label>
              <div className="field-label">
                Status
                <div className={`status-pick status-pick--${form.status}`}>
                  <Segmented
                    label="Status"
                    options={STATUSES}
                    value={form.status}
                    onChange={(status) => setForm((p) => ({ ...p, status }))}
                  />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Save attendance"}
                </button>
              </div>
            </form>
          </div>
        )}
        <div className="card">
          <div className="card__head">
            <div>
              <h2>By class</h2>
              <p>Share present across all recorded days</p>
            </div>
          </div>
          {summary?.by_class.length ? (
            <ul className="bars">
              {summary.by_class.map((c, i) => (
                <li key={c.classroom_id} style={{ "--i": i }}>
                  <span className="bars__label">{c.class_name}</span>
                  <span className="bars__track">
                    <span className={`bars__fill ${c.rate < 75 ? "is-low" : ""}`} style={{ width: `${c.rate}%` }} />
                  </span>
                  <span className="bars__value">{c.rate}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="attendance" title="No attendance yet">
              Marks appear here once attendance is recorded.
            </EmptyState>
          )}
        </div>
      </div>

      <div className="card table-card">
        <div className="toolbar">
          <div className="card__head" style={{ margin: 0 }}>
            <h2>Records</h2>
          </div>
          <div className="filters">
            <select value={filters.classroom_id} onChange={setFilter("classroom_id")} aria-label="Class">
              <option value="">All classes</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <Segmented
            label="Status"
            options={[["", "All"], ...STATUSES]}
            value={filters.status}
            onChange={(status) => setFilters((f) => ({ ...f, status, page: 1 }))}
          />
        </div>
        {records?.items.length === 0 ? (
          <EmptyState icon="attendance" title="No records match">
            {isFetching ? "Loading…" : "Try another class or status."}
          </EmptyState>
        ) : (
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
              {records?.items.map((row) => (
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
                  <td>{displayDate(row.day)}</td>
                  <td>
                    <span className={`badge ${badgeClass(row.status)}`}>{row.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination data={records} onPageChange={(page) => setFilters((f) => ({ ...f, page }))} />
      </div>
    </section>
  );
}
