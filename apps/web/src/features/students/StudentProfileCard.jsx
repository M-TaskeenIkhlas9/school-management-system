import { useStudent } from "../../api/queries.js";
import { average, badgeClass } from "../../lib/format.js";
import Drawer from "../../components/Drawer.jsx";
import Skeleton from "../../components/Skeleton.jsx";

const CHANNELS = [
  ["consent_whatsapp", "WhatsApp"],
  ["consent_sms", "SMS"],
  ["consent_email", "Email"],
];

function Guardians({ guardians }) {
  if (!guardians?.length) return <p className="muted">No guardian on file.</p>;
  return (
    <ul className="guardian-list">
      {guardians.map((g) => {
        const consented = CHANNELS.filter(([field]) => g[field]).map(([, label]) => label);
        return (
          <li key={g.id}>
            <strong>{g.full_name}</strong>
            {g.relationship && <span className="muted"> ({g.relationship})</span>}
            {g.is_primary ? <span className="badge info pill">Primary</span> : null}
            <div className="muted">{[g.phone, g.email].filter(Boolean).join(" · ") || "No contact details"}</div>
            <div className="muted">Agreed to: {consented.length ? consented.join(", ") : "no channels yet"}</div>
          </li>
        );
      })}
    </ul>
  );
}

/** Shows only what the API returned for this user's role (e.g. no fees for teachers). */
/** In a drawer when `onClose` is given (the Students page); inline otherwise. */
export default function StudentProfileCard({ onClose, ...props }) {
  if (!onClose) return <ProfileBody {...props} />;
  return (
    <Drawer title="Student profile" onClose={onClose}>
      <ProfileBody {...props} />
    </Drawer>
  );
}

function ProfileBody({ studentId, classLabel, risk, feeStatus, showFees }) {
  const { data: profile, isLoading } = useStudent(studentId);

  if (!studentId)
    return (
      <div className="card profile-card">
        <div className="empty-card">Choose a student in the list to see their parents, attendance and results.</div>
      </div>
    );
  if (isLoading || !profile)
    return (
      <div className="card profile-card" aria-busy="true">
        <div className="profile-title">
          <Skeleton width={52} height={52} style={{ borderRadius: "50%" }} />
          <div style={{ flex: 1, display: "grid", gap: 8 }}>
            <Skeleton width="55%" height={20} />
            <Skeleton width="30%" />
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          <Skeleton />
          <Skeleton width="80%" />
          <Skeleton width="65%" />
        </div>
      </div>
    );

  const results = profile.results;
  const avg = results ? average(results.map((r) => Number(r.percentage) || 0)) : null;
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
              {risk && (
                <span className={`badge ${risk === "High" ? "danger" : "success"}`}>
                  {risk === "High" ? "High risk" : "Low risk"}
                </span>
              )}
              {showFees && <span className={`badge ${badgeClass(feeStatus)}`}>{feeStatus || "no fees"}</span>}
            </div>
          </div>
        </div>
      </div>
      <div className="profile-grid">
        {profile.attendance_rate !== undefined && (
          <div className="profile-metric">
            <h5>Attendance</h5>
            <p>{profile.attendance_rate ?? "—"}% overall</p>
          </div>
        )}
        <div className="profile-metric">
          <h5>Guardians</h5>
          <Guardians guardians={profile.guardians} />
        </div>
        {results && (
          <div className="profile-metric">
            <h5>Academic History</h5>
            <p>
              Avg {avg === null ? "—" : Math.round(avg)}% across {results.length} result(s)
            </p>
          </div>
        )}
        {risk && (
          <div className="profile-metric">
            <h5>Insight</h5>
            <p>
              {risk === "High"
                ? "Low attendance or marks. Consider meeting the parents."
                : "Student performing within expected range."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
