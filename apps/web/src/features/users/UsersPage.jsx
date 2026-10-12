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
  return (
    <section className="section active">
      <PageHeader title="Users & Access" subtitle="Staff accounts, roles, teachers' classes and sign-in activity." />
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
      {tab === "people" && <PeopleTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "activity" && <ActivityTab />}
    </section>
  );
}
