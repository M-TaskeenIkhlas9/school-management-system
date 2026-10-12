import { useQuery } from "@tanstack/react-query";
import { usersApi, usersKey } from "./api.js";
import { ROLE_LABEL, ROLE_SUMMARY, describePermissions } from "./labels.js";

export default function RolesTab() {
  const { data: roles = [], error } = useQuery({ queryKey: [...usersKey, "roles"], queryFn: usersApi.roles });
  if (error) return <div className="card empty-card">{error.message}</div>;
  return (
    <div className="roles-grid">
      {roles.map((r) => (
        <div key={r.role} className="card role-card">
          <div className="card__title">
            <h4>{ROLE_LABEL[r.role] ?? r.role}</h4>
            {!r.assignable && <span className="badge neutral">Only a principal can assign</span>}
          </div>
          <p className="muted">{ROLE_SUMMARY[r.role]}</p>
          <ul>
            {describePermissions(r.permissions).map(({ area, verbs }) => (
              <li key={area}>
                <span>{area}</span>
                <span className="muted">{verbs.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
