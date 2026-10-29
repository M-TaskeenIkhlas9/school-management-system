import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

/** The school's details as the server knows them. They are set in the server's configuration, not here. */
export default function SettingsPage() {
  const { school } = useAuth();
  const rows = [
    ["School name", school?.name, "SCHOOL_NAME"],
    ["Currency", school?.currency, "CURRENCY"],
    ["Time zone", school?.timezone, "SCHOOL_TIMEZONE"],
    ["Address", school?.address, "SCHOOL_ADDRESS"],
    ["Phone", school?.phone, "SCHOOL_PHONE"],
    ["Bank account (on challans)", school?.bank_details, "SCHOOL_BANK_DETAILS"],
    ["Late fee fine", school?.late_fine ? String(school.late_fine) : "", "FEE_LATE_FINE"],
  ];
  return (
    <section className="section">
      <PageHeader
        icon="settings"
        tone="violet"
        title="Settings"
        subtitle="The school's details, as used in messages to parents and on every page."
      />
      <div className="card">
        <dl className="settings-list">
          {rows.map(([label, value, key]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{value || <span className="muted">Not set</span>}</dd>
              <dd className="muted">
                <code>{key}</code>
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted settings-note">
          These are set in <code>apps/api/.env</code> on the server. Change them there and restart the server.
        </p>
      </div>
    </section>
  );
}
