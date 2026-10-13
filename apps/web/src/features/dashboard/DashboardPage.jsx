import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { useAttendanceSummary, useAttention, useDashboard, useDefaulters, useTrends } from "../../api/queries.js";
import { actionsApi } from "../actions/api.js";
import { formatCurrency, timeAgo } from "../../lib/format.js";
import CountUp from "../../components/CountUp.jsx";
import StatCard from "../../components/StatCard.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";
import TrendChart from "./TrendChart.jsx";
import { describeActivity } from "../users/labels.js";
import { useAuth } from "../../auth/AuthContext.jsx";

const ACTIONS = [
  { label: "New student", path: "/students", icon: "userPlus", permission: "students:write" },
  { label: "Mark attendance", path: "/attendance", icon: "attendance", permission: "attendance:write" },
  { label: "Message parents", path: "/ai-center", icon: "message", permission: "messages:draft" },
  { label: "Report cards", path: "/results", icon: "exams", permission: "results:read" },
  { label: "Record a fee", path: "/fees", icon: "card", permission: "fees:write" },
  { label: "Write an exam", path: "/ai-center", icon: "calendar", permission: "exams:write" },
];

const ask = (q) => `/ai-center?q=${encodeURIComponent(q)}`;

function QuickActionMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);
  if (!actions.length) return null;
  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="btn primary btn--lg"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="plus" size={18} strokeWidth={2} /> Quick action
      </button>
      {open && (
        <div className="menu__panel menu__panel--right" role="menu">
          {actions.map((a) => (
            <Link key={a.label} to={a.path} role="menuitem" className="menu__item" onClick={() => setOpen(false)}>
              <Icon name={a.icon} size={16} /> {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const growth = (n) => (n > 0 ? { dir: "up", text: `+${n} in 30 days` } : { dir: "flat", text: "No change in 30 days" });

function Insight({ level, title, text, open = false, children }) {
  return (
    <details className={`insight insight--${level}`} open={open}>
      <summary>
        <span className={`level level--${level}`}>{level}</span>
        <span className="insight__title">{title}</span>
        <Icon name="chevronRight" size={16} />
      </summary>
      <p>{text}</p>
      {children && <div className="insight__actions">{children}</div>}
    </details>
  );
}

export default function DashboardPage() {
  const { can } = useAuth();
  const canFees = can("fees:read");
  const canReports = can("reports:read");
  const canAttendance = can("attendance:read");
  const canDraft = can("messages:draft");
  const [series, setSeries] = useState("results");

  const { data: s = {}, isLoading } = useDashboard();
  const { data: trends } = useTrends();
  const { data: attention } = useAttention({ enabled: canReports });
  const { data: defaulters = [] } = useDefaulters({ enabled: canFees });
  const { data: attendance } = useAttendanceSummary({ enabled: canAttendance });
  const { data: activity } = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: () => api.get("/dashboard/activity"),
  });
  const { data: pending = [] } = useQuery({
    queryKey: ["actions", "pending"],
    queryFn: () => actionsApi.list("pending"),
    enabled: canDraft,
  });

  const chartData = series === "results" ? (trends?.results_by_term ?? []) : (trends?.attendance_by_day ?? []);
  const flagged = attention?.students?.length ?? 0;
  const waiting = pending.filter((a) => a.can_approve).length;
  const markedToday = attendance?.today?.marked ?? 0;
  const clearance = s.feeDue ? Math.round(((s.feeCollected || 0) / s.feeDue) * 100) : null;
  const attendanceNow = markedToday ? s.todayAttendance : s.attendance30;
  const attendanceDelta =
    markedToday && s.attendance30 !== null
      ? (() => {
          const d = Math.round((s.todayAttendance - s.attendance30) * 10) / 10;
          return { dir: d > 0 ? "up" : d < 0 ? "down" : "flat", text: `${d > 0 ? "+" : ""}${d} pts vs 30 days` };
        })()
      : { dir: "none", text: markedToday ? "Today" : "30-day average" };
  const actions = ACTIONS.filter((a) => can(a.permission));
  const insights = [
    canReports && flagged > 0,
    canFees && defaulters.length > 0,
    canDraft && pending.length > 0,
    canAttendance && attendance && !markedToday,
  ].filter(Boolean).length;

  return (
    <section className="section dashboard">
      <header className="section__header">
        <div>
          <h1>School overview</h1>
          <p className="section__subtitle">A clear view of your school, all in one place.</p>
        </div>
        <div className="section__actions">
          <QuickActionMenu actions={actions} />
        </div>
      </header>

      <div className="kpis">
        <StatCard
          tone="blue"
          icon="students"
          label="Total students"
          loading={isLoading}
          delta={growth(s.newLast30?.students ?? 0)}
        >
          <CountUp value={s.totalStudents} />
        </StatCard>
        <StatCard
          tone="violet"
          icon="teachers"
          label="Total teachers"
          loading={isLoading}
          delta={growth(s.newLast30?.teachers ?? 0)}
        >
          <CountUp value={s.totalTeachers} />
        </StatCard>
        <StatCard
          tone="green"
          icon="book"
          label="Active classes"
          loading={isLoading}
          delta={growth(s.newLast30?.classes ?? 0)}
        >
          <CountUp value={s.activeClasses} />
        </StatCard>
        {canFees && (
          <StatCard
            tone="amber"
            icon="money"
            label="Fees collected"
            loading={isLoading}
            delta={{ dir: "none", text: clearance === null ? "Nothing billed" : `${clearance}% of billed` }}
          >
            <CountUp value={s.feeCollected} format={formatCurrency} />
          </StatCard>
        )}
        <StatCard tone="rose" icon="attendance" label="Attendance" loading={isLoading} delta={attendanceDelta}>
          {attendanceNow === null || attendanceNow === undefined ? (
            "—"
          ) : (
            <CountUp value={attendanceNow} format={(n) => `${n.toFixed(1)}%`} />
          )}
        </StatCard>
      </div>

      <div className="overview">
        <div className="overview__main">
          <div className="card">
            <div className="card__head">
              <div>
                <h2>{series === "results" ? "Academic performance" : "Daily attendance"}</h2>
                <p>{series === "results" ? "Average result by term" : "Share of students present, last 14 days"}</p>
              </div>
              <div className="segmented" role="tablist" aria-label="Chart">
                {[
                  ["results", "Results"],
                  ["attendance", "Attendance"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={series === key}
                    className={series === key ? "is-active" : ""}
                    onClick={() => setSeries(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {chartData.length ? (
              <TrendChart key={series} series={chartData} />
            ) : (
              <div className="chart-empty">
                <span className="chart-empty__icon">
                  <Icon name="chart" size={26} />
                </span>
                <strong>{series === "results" ? "No results yet" : "No attendance yet"}</strong>
                <span>
                  {series === "results"
                    ? "Averages appear here once term results are entered."
                    : "The daily rate appears here once attendance is marked."}
                </span>
                <Link to={series === "results" ? "/results" : "/attendance"} className="btn ghost small">
                  {series === "results" ? "Enter results" : "Mark attendance"}
                </Link>
              </div>
            )}
          </div>

          <div className="mini-grid">
            {canAttendance && (
              <div className="mini mini--green">
                <span className="tile tile--green">
                  <Icon name="userPlus" size={22} />
                </span>
                <div>
                  <span className="mini__label">Attendance, last 30 days</span>
                  <strong className="mini__value">
                    {s.attendance30 === null || s.attendance30 === undefined ? "—" : `${s.attendance30}%`}
                  </strong>
                  <span className="mini__note">{(attendance?.by_class ?? []).length} classes recorded</span>
                </div>
              </div>
            )}
            {canFees && (
              <div className="mini mini--blue">
                <span className="tile tile--blue">
                  <Icon name="card" size={22} />
                </span>
                <div className="mini__grow">
                  <span className="mini__label">Fee clearance</span>
                  <strong className="mini__value">{clearance === null ? "—" : `${clearance}%`}</strong>
                  <span className="progress" aria-hidden="true">
                    <span style={{ width: `${clearance ?? 0}%` }} />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="card insights">
          <div className="insights__head">
            <h2>
              <Icon name="sparkle" size={22} /> AI insights
            </h2>
            {insights > 0 && (
              <span className="pill">
                {insights} {insights === 1 ? "insight" : "insights"}
              </span>
            )}
          </div>
          <p className="insights__sub">Priority items from today&apos;s data, ready to act on.</p>
          <div className="insights__list">
            {canReports && flagged > 0 && (
              <Insight
                level="critical"
                open
                title="Academic intervention"
                text={`${flagged} ${flagged === 1 ? "student has" : "students have"} low attendance or marks.`}
              >
                {canDraft && (
                  <Link
                    className="btn primary small"
                    to={ask("Draft a message to the parents of students who need attention")}
                  >
                    Message parents
                  </Link>
                )}
                <Link className="btn ghost small" to="/students">
                  View students
                </Link>
              </Insight>
            )}
            {canFees && defaulters.length > 0 && (
              <Insight
                level="medium"
                open
                title="Fee recovery"
                text={`${defaulters.length} overdue fee ${defaulters.length === 1 ? "record" : "records"}.`}
              >
                {canDraft && (
                  <Link
                    className="btn primary small"
                    to={ask("Send a fee reminder to the parents whose fees are overdue")}
                  >
                    Send reminders
                  </Link>
                )}
                <Link className="btn ghost small" to="/fees">
                  Review overdue
                </Link>
              </Insight>
            )}
            {canDraft && pending.length > 0 && (
              <Insight
                level="action"
                title="Waiting for approval"
                text={`${pending.length} prepared ${pending.length === 1 ? "item" : "items"}${waiting ? `, ${waiting} for you to approve` : ""}.`}
              >
                <Link className="btn ghost small" to="/approvals">
                  Review
                </Link>
              </Insight>
            )}
            {canAttendance && attendance && !markedToday && (
              <Insight level="info" title="Attendance not marked" text="No attendance has been marked for today yet.">
                {can("attendance:write") && (
                  <Link className="btn ghost small" to="/attendance">
                    Mark attendance
                  </Link>
                )}
              </Insight>
            )}
            {insights === 0 && <p className="muted">Nothing needs attention right now.</p>}
          </div>
          {can("assistant:use") && (
            <Link to="/ai-center" className="ask-ai">
              <Icon name="sparkle" size={20} /> Ask AI assistant
            </Link>
          )}
        </aside>

        <div className="card activity">
          <div className="card__head">
            <h2>{activity?.scope === "mine" ? "Your recent activity" : "Recent activity"}</h2>
            {can("users:manage") && (
              <Link to="/users" className="link-arrow">
                View all <Icon name="arrow" size={16} />
              </Link>
            )}
          </div>
          {activity?.items?.length ? (
            <ul className="activity__list">
              {activity.items.map((a) => (
                <li key={a.id}>
                  <Avatar name={a.username ?? "System"} size={40} />
                  <div>
                    <strong>{a.username ?? "System"}</strong>
                    <span>{describeActivity(a)}</span>
                  </div>
                  <time dateTime={a.created_at}>{timeAgo(a.created_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Changes people make — accounts, approvals, classes — will be listed here.</p>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Quick actions</h2>
          </div>
          <nav className="quick" aria-label="Quick actions">
            {actions.map((a) => (
              <Link key={a.label} to={a.path} className="quick__item">
                <span className="quick__icon">
                  <Icon name={a.icon} size={20} />
                </span>
                {a.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </section>
  );
}
