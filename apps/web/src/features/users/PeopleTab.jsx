import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiMutation, useClassrooms, useTeachers } from "../../api/queries.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { fullName } from "../../lib/format.js";
import ClassPicker from "./ClassPicker.jsx";
import TempPassword from "./TempPassword.jsx";
import AccountEditor from "./AccountEditor.jsx";
import { usersApi, usersKey } from "./api.js";
import { ROLE_LABEL, generatePassword } from "./labels.js";

const emptyForm = () => ({ username: "", email: "", role: "teacher", teacher_id: "", classroom_ids: [] });
const when = (value) => (value ? new Date(value).toLocaleString() : "Never");

export default function PeopleTab() {
  const { user: me } = useAuth();
  const { data: users = [], isLoading } = useQuery({ queryKey: usersKey, queryFn: usersApi.list });
  const { data: roles = [] } = useQuery({ queryKey: [...usersKey, "roles"], queryFn: usersApi.roles });
  const { data: teachers = [] } = useTeachers();
  const { data: classrooms = [] } = useClassrooms();
  const [form, setForm] = useState(emptyForm);
  const [issued, setIssued] = useState(null); // { email, password } shown once
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("");

  const assignable = roles.filter((r) => r.assignable).map((r) => r.role);
  const linkedTeacherIds = new Set(users.filter((u) => u.teacher_id).map((u) => u.teacher_id));
  const freeTeachers = teachers.filter((t) => !linkedTeacherIds.has(t.id));
  const className = new Map(classrooms.map((c) => [c.id, c.name]));

  const create = useApiMutation((data) => usersApi.create(data), {
    invalidate: [usersKey],
    success: (u) => `Account created for ${u.username}`,
  });

  const submit = (event) => {
    event.preventDefault();
    const password = generatePassword();
    const teacher = form.role === "teacher";
    create.mutate(
      {
        username: form.username,
        email: form.email,
        password,
        role: form.role,
        ...(teacher ? { teacher_id: Number(form.teacher_id), classroom_ids: form.classroom_ids } : {}),
      },
      {
        onSuccess: () => {
          setIssued({ email: form.email.trim().toLowerCase(), password });
          setForm(emptyForm());
        },
      }
    );
  };

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const pickTeacher = (e) => {
    const t = teachers.find((x) => x.id === Number(e.target.value));
    setForm((f) => ({
      ...f,
      teacher_id: e.target.value,
      username: f.username || (t ? fullName(t) : ""),
      email: f.email || t?.email || "",
    }));
  };

  const needle = filter.trim().toLowerCase();
  const shown = users.filter(
    (u) => !needle || `${u.username} ${u.email} ${u.role} ${u.teacher_name ?? ""}`.toLowerCase().includes(needle)
  );

  return (
    <>
      <div className="card form-card">
        <div className="card__title">
          <h4>Add an account</h4>
          <span className="ai-pill">A temporary password is generated</span>
        </div>
        {issued ? (
          <TempPassword {...issued} onDone={() => setIssued(null)} />
        ) : (
          <form className="account-form" onSubmit={submit}>
            <label>
              Role
              <select value={form.role} onChange={set("role")}>
                {assignable.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            {form.role === "teacher" && (
              <label>
                Teacher record
                <select value={form.teacher_id} onChange={pickTeacher} required>
                  <option value="">Choose a teacher…</option>
                  {freeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fullName(t)}
                      {t.subject ? ` (${t.subject})` : ""}
                    </option>
                  ))}
                </select>
                {!freeTeachers.length && (
                  <small className="muted">Every teacher already has an account. Add the teacher first.</small>
                )}
              </label>
            )}
            <label>
              Name
              <input value={form.username} onChange={set("username")} required maxLength={100} />
            </label>
            <label>
              Email (used to sign in)
              <input type="email" value={form.email} onChange={set("email")} required />
            </label>
            {form.role === "teacher" && (
              <div className="account-form__wide">
                <span className="field-label">Classes they can see</span>
                <ClassPicker
                  classrooms={classrooms}
                  value={form.classroom_ids}
                  onChange={(ids) => setForm((f) => ({ ...f, classroom_ids: ids }))}
                />
              </div>
            )}
            <div className="form-actions account-form__wide">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Creating…" : "Create account"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="card table-card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search by name, email or role"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Search accounts"
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Access</th>
              <th>Status</th>
              <th>Last sign-in</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan="6">Loading…</td>
              </tr>
            )}
            {shown.map((u) => (
              <Fragment key={u.id}>
                <tr className={u.is_active ? "" : "row-muted"}>
                  <td>
                    {u.username}
                    {u.id === me?.id && <span className="muted"> (you)</span>}
                    <div className="muted">{u.email}</div>
                  </td>
                  <td>
                    <span className={`badge role-${u.role}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                  </td>
                  <td>
                    {u.role === "teacher" ? (
                      <>
                        <div>{u.teacher_name ?? "No teacher record"}</div>
                        <div className="muted">
                          {u.class_ids.length
                            ? u.class_ids.map((id) => className.get(id) ?? `#${id}`).join(", ")
                            : "No classes — sees nothing yet"}
                        </div>
                      </>
                    ) : (
                      <span className="muted">Whole school</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? "success" : "neutral"}`}>
                      {u.is_active ? "Active" : "Deactivated"}
                    </span>
                  </td>
                  <td>{when(u.last_login_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn ghost small"
                      aria-expanded={openId === u.id}
                      onClick={() => setOpenId(openId === u.id ? null : u.id)}
                    >
                      {openId === u.id ? "Close" : "Manage"}
                    </button>
                  </td>
                </tr>
                {openId === u.id && (
                  <tr className="editor-row">
                    <td colSpan="6">
                      <AccountEditor
                        account={u}
                        isSelf={u.id === me?.id}
                        assignable={assignable}
                        teachers={teachers}
                        linkedTeacherIds={linkedTeacherIds}
                        classrooms={classrooms}
                        onClose={() => setOpenId(null)}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
