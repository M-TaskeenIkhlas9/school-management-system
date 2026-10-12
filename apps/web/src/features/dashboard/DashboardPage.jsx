import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAttendanceSummary, useAttention, useDashboard, useDefaulters, useTrends } from "../../api/queries.js";
import { actionsApi } from "../actions/api.js";
import { formatCurrency } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import CountUp from "../../components/CountUp.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import Icon from "../../app/Icon.jsx";
import TrendChart from "./TrendChart.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

const SHORTCUTS = [
  {
    label: "Mark attendance",
    hint: "Today's register",
    path: "/attendance",
    icon: "attendance",
    permission: "attendance:write",
  },
  { label: "Record a fee", hint: "Payment or new bill", path: "/fees", icon: "fees", permission: "fees:write" },
  { label: "Add a student", hint: "New admission", path: "/students", icon: "students", permission: "students:write" },
  { label: "Enter results", hint: "Term marks", path: "/results", icon: "results", permission: "results:write" },
  {
    label: "Message parents",
    hint: "Through the assistant",
    path: "/ai-center",
    icon: "outbox",
    permission: "messages:draft",
  },
];

function greeting(timeZone) {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function Figure({ loading, children }) {
  return loading ? <Skeleton width="60%" height={34} /> : children;
}

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
  const collectedShare = s.feeDue ? Math.min(100, Math.round(((s.feeCollected || 0) / s.feeDue) * 100)) : 0;
  const classes = attendance?.by_class ?? [];

  const tasks = [
    canDraft &&
      pending.length > 0 && {
        count: pending.length,
        text: waiting
          ? `${waiting === 1 ? "item is" : "items are"} waiting for your approval`
          : `${pending.length === 1 ? "draft is" : "drafts are"} waiting for approval`,
        to: "/approvals",
        tone: "brand",
      },
    canFees &&
      defaulters.length > 0 && {
        count: defaulters.length,
        text: `overdue fee ${defaulters.length === 1 ? "record" : "records"}`,
        to: "/fees",
        tone: "warn",
      },
    canReports &&
      attention?.students?.length > 0 && {
        count: attention.students.length,
        text: `${attention.students.length === 1 ? "student" : "students"} flagged for low attendance or marks`,
        to: "/students",
        tone: "bad",
      },
    canAttendance &&
      attendance &&
      markedToday === 0 && {
        count: "—",
        text: "Attendance hasn't been marked today",
        to: "/attendance",
        tone: "muted",
      },
  ].filter(Boolean);

  return (
    <section className="section dashboard">
      <PageHeader
        eyebrow="Today"
        title={`${greeting(school?.timezone)}, ${user?.username ?? ""}`}
        subtitle="Here is where the school stands today."
      />

      <dl className="register" aria-label="Today in numbers">
        <div className="register__cell">
          <dt>Students</dt>
          <dd>
            <Figure loading={isLoading}>
              <CountUp value={s.totalStudents} />
            </Figure>
          </dd>
          <span>in {plural(s.activeClasses ?? 0, "class", "classes")}</span>
        </div>
        <div className="register__cell">
          <dt>Present today</dt>
          <dd>
            <Figure loading={isLoading}>
              {s.todayAttendance ? <CountUp value={s.todayAttendance} format={(n) => `${Math.round(n)}%`} /> : "—"}
            </Figure>
          </dd>
          <span>{markedToday ? `${plural(markedToday, "mark")} so far` : "Not marked yet"}</span>
        </div>
        <div className="register__cell">
          <dt>Teachers</dt>
          <dd>
            <Figure loading={isLoading}>
              <CountUp value={s.totalTeachers} />
            </Figure>
          </dd>
          <span>on the staff list</span>
        </div>
        {canFees && (
          <div className="register__cell">
            <dt>Fees collected</dt>
            <dd>
              <Figure loading={isLoading}>
                <CountUp value={s.feeCollected} format={formatCurrency} />
              </Figure>
            </dd>
            <span>
              {collectedShare}% of {formatCurrency(s.feeDue)} billed
            </span>
            <span className="register__bar" aria-hidden="true">
              <span style={{ width: `${collectedShare}%` }} />
            </span>
          </div>
        )}
      </dl>

      <div className="dashboard__grid">
        <div className="card">
          <div className="card__title">
            <h2>Needs attention</h2>
            {tasks.length > 0 && <span>{plural(tasks.length, "item")}</span>}
          </div>
          {tasks.length ? (
            <ul className="tasks">
              {tasks.map((t, i) => (
                <li key={t.to + t.text} style={{ "--i": i }}>
                  <Link to={t.to} className={`tasks__item tasks__item--${t.tone}`}>
                    <span className="tasks__count">{t.count}</span>
                    <span className="tasks__text">{t.text}</span>
                    <span className="tasks__go">
                      <Icon name="arrow" size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="all-clear">
              <span className="all-clear__tick" aria-hidden="true">
                ✓
              </span>
              <p>Nothing needs you right now.</p>
            </div>
          )}
        </div>

        <div className="card chart-panel">
          <div className="card__title">
            <h2>{byTerm.length ? "Average result by term" : "Attendance, last 14 days"}</h2>
            <span>Hover a point for its figure</span>
          </div>
          <TrendChart series={series} />
        </div>
      </div>

      <div className="dashboard__grid dashboard__grid--even">
        {canAttendance && (
          <div className="card">
            <div className="card__title">
              <h2>Attendance by class</h2>
              <span>All recorded days</span>
            </div>
            {classes.length ? (
              <ul className="bars">
                {classes.map((c, i) => (
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
              <p className="muted">No attendance recorded yet.</p>
            )}
          </div>
        )}

        <div className="card">
          <div className="card__title">
            <h2>Quick actions</h2>
          </div>
          <nav className="quick" aria-label="Quick actions">
            {SHORTCUTS.filter((a) => can(a.permission)).map((a) => (
              <Link key={a.path + a.label} to={a.path} className="quick__item">
                <span className="quick__icon">
                  <Icon name={a.icon} size={18} />
                </span>
                <span>
                  <strong>{a.label}</strong>
                  <small>{a.hint}</small>
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
