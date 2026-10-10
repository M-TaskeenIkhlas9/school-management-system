import { useNavigate } from "react-router-dom";
import { useAttention, useCurriculum, useDashboard, useFeesPage, useTrends } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { formatCurrency, fullName } from "../../lib/format.js";
import TrendChart from "./TrendChart.jsx";

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: stats, isLoading } = useDashboard();
  const { data: attention } = useAttention();
  const { data: curriculum = [] } = useCurriculum();
  const { data: trends } = useTrends();
  const { data: recentFees } = useFeesPage({ page: 1, pageSize: 2 });
  const { students, classLabelOf } = useLookups();
  const byTerm = trends?.results_by_term ?? [];
  const series = byTerm.length ? byTerm : trends?.attendance_by_day ?? [];

  const s = stats || {};

  return (
    <section className="section active dashboard">
      <div className="dashboard-hero">
        <div className="dashboard-hero__text">
          <div className="dashboard-breadcrumb">Home / Dashboard</div>
          <h3>Institution Command Center</h3>
          <p>University-grade insights for students, faculty, finance, and academic performance in one view.</p>
        </div>
        <div className="section__actions">
          <button className="btn primary" onClick={() => navigate("/ai-center")}>
            Ask AI
          </button>
        </div>
      </div>

      <div className="dashboard-banner">
        <span>✅ Live data synced</span>
        <p>Updates are reflected instantly across reports and AI insights.</p>
      </div>

      <div className="dashboard-kpis">
        <div className="card kpi-card">
          <div className="kpi-icon">🎓</div>
          <div>
            <p>Total Students</p>
            <h4>{s.totalStudents ?? "—"}</h4>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">👩‍🏫</div>
          <div>
            <p>Total Teachers</p>
            <h4>{s.totalTeachers ?? "—"}</h4>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">🏫</div>
          <div>
            <p>Active Classes</p>
            <h4>{s.activeClasses ?? "—"}</h4>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">💵</div>
          <div>
            <p>Fees Collected</p>
            <h4>{formatCurrency(s.feeCollected)}</h4>
            <span className="trend up">{formatCurrency(s.feeDue)} billed</span>
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-icon">✅</div>
          <div>
            <p>Attendance Today</p>
            <h4>{s.todayAttendance ?? 0}%</h4>
            <span className="trend neutral">Daily tracking</span>
          </div>
        </div>
      </div>

      <div className="dashboard-main">
        <div className="card chart-panel">
          <div className="card__title">
            <h5>Academic Performance Trends</h5>
            <span>{byTerm.length ? "Average result by term" : "Daily attendance (last 14 days)"}</span>
          </div>
          <div className="chart-placeholder">
            <TrendChart series={series} />
          </div>
        </div>

        <div className="card ai-hub">
          <div className="card__title">
            <h5>AI Intelligence Hub</h5>
            <span>Priority alerts</span>
          </div>
          <div className="ai-hub-item">
            <span className="badge danger pill">Critical</span>
            <p>{attention?.students?.length ?? 0} students require intervention.</p>
          </div>
          <div className="ai-hub-item">
            <span className="badge warning pill">Medium</span>
            <p>{s.unpaidFees ?? 0} fee records unpaid.</p>
          </div>
          <div className="ai-hub-item">
            <span className="badge info pill">Info</span>
            <p>Curriculum mapping is {curriculum.length} items deep.</p>
          </div>
          <button className="btn primary" onClick={() => navigate("/ai-center")}>
            Ask the assistant
          </button>
        </div>
      </div>

      <div className="dashboard-secondary">
        <div className="card quick-actions">
          <div className="card__title">
            <h5>Quick Actions</h5>
            <span>Daily workflow</span>
          </div>
          <div className="action-grid">
            <button className="action-tile" onClick={() => navigate("/students")}>
              <span>New Student</span>
              <small>Registration</small>
            </button>
            <button className="action-tile" onClick={() => navigate("/exams")}>
              <span>Exam Prep</span>
              <small>Schedule</small>
            </button>
            <button className="action-tile" onClick={() => navigate("/ai-center")}>
              <span>Broadcast</span>
              <small>Message parents</small>
            </button>
            <button className="action-tile" onClick={() => navigate("/results")}>
              <span>Report Card</span>
              <small>Results</small>
            </button>
          </div>
        </div>

        <div className="card table-card">
          <div className="card__title">
            <h5>Activity Pulse</h5>
            <span>Recent updates</span>
          </div>
          <ul className="activity-list">
            {students.slice(0, 3).map((student) => (
              <li key={student.id}>
                <strong>{fullName(student)}</strong>
                <span>Added to {classLabelOf(student.id)}</span>
              </li>
            ))}
            {(recentFees?.items ?? []).map((fee) => (
              <li key={`fee-${fee.id}`}>
                <strong>{fee.student_name}</strong>
                <span>Fee due {formatCurrency(fee.amount_due)}</span>
              </li>
            ))}
            {students.length === 0 && !recentFees?.total && <li>Activity will appear here as you manage records.</li>}
          </ul>
        </div>
      </div>

      {isLoading && <p className="muted">Loading live data...</p>}
    </section>
  );
}
