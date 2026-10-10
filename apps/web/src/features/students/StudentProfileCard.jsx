import { useNavigate } from "react-router-dom";
import { useStudent } from "../../api/queries.js";
import { average } from "../../lib/format.js";

export default function StudentProfileCard({ studentId, classLabel, risk, feeStatus }) {
  const navigate = useNavigate();
  const { data: profile, isLoading } = useStudent(studentId);

  if (!studentId)
    return (
      <div className="card profile-card">
        <div className="empty-card">Select a student to see their profile.</div>
      </div>
    );
  if (isLoading || !profile)
    return (
      <div className="card profile-card">
        <div className="empty-card">Loading profile…</div>
      </div>
    );

  const avg = average(profile.results.map((r) => Number(r.percentage) || 0));
  return (
    <div className="card profile-card">
      <div className="profile">
        <div className="profile-title">
          <div className="student-avatar large">
            {profile.first_name?.[0]}
            {profile.last_name?.[0]}
          </div>
          <div>
            <h4>
              {profile.first_name} {profile.last_name}
            </h4>
            <p>{classLabel}</p>
            <div className="profile-tags">
              <span className="badge info pill">{risk === "High" ? "High Risk" : "Low Risk"}</span>
              <span className="badge warning pill">{feeStatus || "No Fees"}</span>
            </div>
          </div>
        </div>
        <button className="btn ghost" onClick={() => navigate("/ai-center")}>
          Ask AI about this student
        </button>
      </div>
      <div className="profile-grid">
        <div className="profile-metric">
          <h5>Attendance</h5>
          <p>{profile.attendance_rate ?? "—"}% overall</p>
        </div>
        <div className="profile-metric">
          <h5>Guardian</h5>
          <p>
            {profile.guardian_name || "—"}
            {profile.guardian_email ? ` · ${profile.guardian_email}` : " · no email on file"}
          </p>
        </div>
        <div className="profile-metric">
          <h5>Academic History</h5>
          <p>
            Avg {avg === null ? "—" : Math.round(avg)}% across {profile.results.length} result(s)
          </p>
        </div>
        <div className="profile-metric">
          <h5>AI Insight</h5>
          <p>
            {risk === "High"
              ? "Recommend parent meeting and support plan."
              : "Student performing within expected range."}
          </p>
        </div>
      </div>
    </div>
  );
}
