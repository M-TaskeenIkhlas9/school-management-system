import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import PeopleTab from "./PeopleTab.jsx";
import RolesTab from "./RolesTab.jsx";
import ActivityTab from "./ActivityTab.jsx";
import "./users.css";
import { useQuery } from "@tanstack/react-query";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import { usersApi, usersKey } from "./api.js";

const TABS = [
  ["people", "People"],
  ["roles", "What each role can do"],
  ["activity", "Activity"],
];

export default function UsersPage() {
  const [tab, setTab] = useState("people");
  const [adding, setAdding] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: usersKey, queryFn: usersApi.list });
  return (
    <section className="section">
      <PageHeader
        icon="users"
        tone="blue"
        title="Users & access"
        subtitle="Staff accounts, what each role can do, and who signed in when."
      >
        {tab === "people" && !adding && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            Add an account
          </button>
        )}
      </PageHeader>
      <StatRow>
        <StatCard tone="blue" icon="users" label="Accounts">
          <CountUp value={users.length} />
        </StatCard>
        <StatCard tone="green" icon="approvals" label="Active">
          <CountUp value={users.filter((u) => u.is_active).length} />
        </StatCard>
        <StatCard tone="violet" icon="teachers" label="Teachers with classes">
          <CountUp value={users.filter((u) => u.role === "teacher" && u.class_ids.length).length} />
        </StatCard>
        <StatCard tone="amber" icon="bell" label="Never signed in" note="may need their password">
          <CountUp value={users.filter((u) => !u.last_login_at).length} />
        </StatCard>
      </StatRow>

      <Segmented label="Section" options={TABS} value={tab} onChange={setTab} />
      {tab === "people" && <PeopleTab adding={adding} onAddingChange={setAdding} />}
      {tab === "roles" && <RolesTab />}
      {tab === "activity" && <ActivityTab />}
    </section>
  );
}
