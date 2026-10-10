import PageHeader from "../../components/PageHeader.jsx";

// Placeholder: these values are not stored yet. School name, timezone and currency
// are currently configured on the server (SCHOOL_NAME, SCHOOL_TIMEZONE, CURRENCY in apps/api/.env).
export default function SettingsPage() {
  return (
    <section className="section active">
      <PageHeader title="Settings" subtitle="School profile and preferences." />
      <div className="card">
        <p className="muted" style={{ marginBottom: 12 }}>
          Settings can&apos;t be saved from here yet. The school name, timezone and currency are set on the server in
          <code> apps/api/.env</code>.
        </p>
        <div className="form-grid">
          <label>
            School Name
            <input type="text" defaultValue="Cambridge Public School" disabled />
          </label>
          <label>
            Academic Session
            <input type="text" defaultValue="2025-2026" disabled />
          </label>
        </div>
      </div>
    </section>
  );
}
