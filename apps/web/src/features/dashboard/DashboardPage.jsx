import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAttendanceSummary, useAttention, useDashboard, useDefaulters, useTrends } from "../../api/queries.js";
import { actionsApi } from "../actions/api.js";
import { formatCurrency } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import TrendChart from "./TrendChart.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

const SHORTCUTS = [
  { label: "Mark attendance", path: "/attendance", permission: "attendance:write" },
  { label: "Record a fee", path: "/fees", permission: "fees:write" },
  { label: "Add a student", path: "/students", permission: "students:write" },
  { label: "Enter results", path: "/results", permission: "results:write" },
];

function greeting(timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export default function DashboardPage() {
  const { can, user, school } = useAuth();
  const canFees = can("fees:read");
  const canReports = can("reports:read");
  const canAttendance = can("attendance:read");
  const canDraft = can("messages:draft");

  const { data: s = {}, isLoading } = useDashboard();
  const { data: trends } = useTrends();
  const { data: attention } = useAttention({ enabled: canReports });
  const { data: defaulters = [] } = useDefaulters({ enabled: canFees });
  const { data: attendance } = useAttendanceSummary({ enabled: canAttendance });
  const { data: pending = [] } = useQuery({
    queryKey: ["actions", "pending"],
    queryFn: () => actionsApi.list("pending"),
    enabled: canDraft,
  });

  const byTerm = trends?.results_by_term ?? [];
  const series = byTerm.length ? byTerm : (trends?.attendance_by_day ?? []);
  const markedToday = attendance?.today?.marked ?? 0;
  const waiting = pending.filter((a) => a.can_approve).length;

  const tasks = [
    canDraft &&
      pending.length > 0 && {
        count: pending.length,
        text: waiting
          ? `${plural(waiting, "item")} waiting for your approval`
          : `${plural(pending.length, "draft")} waiting for approval`,
        to: "/approvals",
      },
    canFees &&
      defaulters.length > 0 && {
        count: defaulters.length,
        text: `overdue fee ${defaulters.length === 1 ? "record" : "records"}`,
        to: "/fees",
      },
    canReports &&
      attention?.students?.length > 0 && {
        count: attention.students.length,
        text: `${attention.students.length === 1 ? "student" : "students"} flagged for low attendance or marks`,
        to: "/students",
      },
    canAttendance &&
      attendance &&
      markedToday === 0 && { count: "—", text: "Attendance hasn't been marked today", to: "/attendance" },
  ].filter(Boolean);

  return (
    <section className="section dashboard">
      <PageHeader
        eyebrow="Today"
        title={`${greeting(school?.timezone)}, ${user?.username ?? ""}`}
        subtitle={isLoading ? "Loading today's figures…" : "Here is where the school stands today."}
      />

      <dl className="register" aria-label="Today in numbers">
        <div className="register__cell">
          <dt>Students</dt>
          <dd>{s.totalStudents ?? "—"}</dd>
          <span>in {plural(s.activeClasses ?? 0, "class", "classes")}</span>
        </div>
        <div className="register__cell">
          <dt>Present today</dt>
          <dd>{s.todayAttendance ? `${s.todayAttendance}%` : "—"}</dd>
          <span>{markedToday ? `${plural(markedToday, "mark")} so far` : "Not marked yet"}</span>
        </div>
        <div className="register__cell">
          <dt>Teachers</dt>
          <dd>{s.totalTeachers ?? "—"}</dd>
          <span>on the staff list</span>
        </div>
        {canFees && (
          <div className="register__cell">
            <dt>Fees collected</dt>
            <dd>{formatCurrency(s.feeCollected)}</dd>
            <span>of {formatCurrency(s.feeDue)} billed</span>
          </div>
        )}
      </dl>

      <div className="dashboard__grid">
        <div className="card">
          <div className="card__title">
            <h2>Needs attention</h2>
          </div>
          {tasks.length ? (
            <ul className="tasks">
              {tasks.map((t) => (
                <li key={t.to + t.text}>
                  <Link to={t.to} className="tasks__item">
                    <span className="tasks__count">{t.count}</span>
                    <span className="tasks__text">{t.text}</span>
                    <span className="tasks__go" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing needs you right now.</p>
          )}
        </div>

        <div className="card chart-panel">
          <div className="card__title">
            <h2>{byTerm.length ? "Average result by term" : "Attendance, last 14 days"}</h2>
          </div>
          <TrendChart series={series} />
        </div>
      </div>

      <nav className="shortcuts" aria-label="Shortcuts">
        {SHORTCUTS.filter((a) => can(a.permission)).map((a) => (
          <Link key={a.path} to={a.path} className="btn ghost">
            {a.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}
