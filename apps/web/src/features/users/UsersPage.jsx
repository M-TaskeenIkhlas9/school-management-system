import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import PeopleTab from "./PeopleTab.jsx";
import RolesTab from "./RolesTab.jsx";
import ActivityTab from "./ActivityTab.jsx";
import "./users.css";

const TABS = [
  ["people", "People"],
  ["roles", "What each role can do"],
  ["activity", "Activity"],
];

export default function UsersPage() {
  const [tab, setTab] = useState("people");
  const [adding, setAdding] = useState(false);
  return (
    <section className="section">
      <PageHeader title="Users & access" subtitle="Staff accounts, what each role can do, and who signed in when.">
        {tab === "people" && !adding && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            Add an account
          </button>
        )}
      </PageHeader>
      <div className="users-tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`users-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "people" && <PeopleTab adding={adding} onAddingChange={setAdding} />}
      {tab === "roles" && <RolesTab />}
      {tab === "activity" && <ActivityTab />}
    </section>
  );
}
