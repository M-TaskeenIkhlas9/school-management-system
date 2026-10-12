import { useState } from "react";
import { useApiMutation } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import ClassPicker from "./ClassPicker.jsx";
import TempPassword from "./TempPassword.jsx";
import { usersApi, usersKey } from "./api.js";
import { ROLE_LABEL, generatePassword } from "./labels.js";

/** Change one account: role, teacher link and classes, active state, password, sessions. */
export default function AccountEditor({
  account,
  isSelf,
  assignable,
  teachers,
  linkedTeacherIds,
  classrooms,
  onClose,
}) {
  const [draft, setDraft] = useState({
    username: account.username,
    role: account.role,
    teacher_id: account.teacher_id ? String(account.teacher_id) : "",
    classroom_ids: account.class_ids,
  });
  const [issued, setIssued] = useState(null);

  const save = useApiMutation((changes) => usersApi.update(account.id, changes), {
    invalidate: [usersKey],
    success: "Account updated",
  });
  const signOut = useApiMutation(() => usersApi.signOut(account.id), {
    success: `${account.username} was signed out everywhere`,
  });

  // Only a principal may change a principal; the server enforces it, the editor just doesn't offer it.
  const locked = account.role === "principal" && !assignable.includes("principal");
  const roleOptions = assignable.includes(account.role) ? assignable : [account.role, ...assignable];
  const teacherOptions = teachers.filter((t) => t.id === account.teacher_id || !linkedTeacherIds.has(t.id));

  const submit = (event) => {
    event.preventDefault();
    const changes = { username: draft.username };
    if (draft.role !== account.role) changes.role = draft.role;
    if (draft.role === "teacher") {
      changes.teacher_id = Number(draft.teacher_id);
      changes.classroom_ids = draft.classroom_ids;
    }
    save.mutate(changes, { onSuccess: onClose });
  };

  const resetPassword = () => {
    const password = generatePassword();
    save.mutate({ password }, { onSuccess: () => setIssued({ email: account.email, password }) });
  };

  const confirmSignOut = () => {
    const who = isSelf ? "you (including this browser)" : account.username;
    if (window.confirm(`Sign ${who} out on every device?`)) signOut.mutate();
  };

  const toggleActive = () => {
    const verb = account.is_active ? "Deactivate" : "Reactivate";
    if (!window.confirm(`${verb} ${account.username}'s account?`)) return;
    save.mutate({ is_active: !account.is_active }, { onSuccess: onClose });
  };

  if (issued) return <TempPassword {...issued} onDone={onClose} />;
  if (locked) {
    return <p className="muted">Only a principal can change a principal&apos;s account.</p>;
  }

  return (
    <form className="account-editor" onSubmit={submit}>
      <div className="account-form">
        <label>
          Name
          <input
            value={draft.username}
            onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
            required
          />
        </label>
        <label>
          Role
          <select
            value={draft.role}
            disabled={isSelf}
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
          >
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {isSelf && <small className="muted">You can&apos;t change your own role.</small>}
        </label>
        {draft.role === "teacher" && (
          <>
            <label>
              Teacher record
              <select
                value={draft.teacher_id}
                required
                onChange={(e) => setDraft((d) => ({ ...d, teacher_id: e.target.value }))}
              >
                <option value="">Choose a teacher…</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {fullName(t)}
                  </option>
                ))}
              </select>
            </label>
            <div className="account-form__wide">
              <span className="field-label">Classes they can see</span>
              <ClassPicker
                classrooms={classrooms}
                value={draft.classroom_ids}
                onChange={(ids) => setDraft((d) => ({ ...d, classroom_ids: ids }))}
              />
            </div>
          </>
        )}
      </div>
      <div className="account-editor__actions">
        <button type="submit" className="btn primary" disabled={save.isPending}>
          Save changes
        </button>
        <button type="button" className="btn ghost" disabled={save.isPending} onClick={resetPassword}>
          Reset password
        </button>
        <button type="button" className="btn ghost" disabled={signOut.isPending} onClick={confirmSignOut}>
          Sign out everywhere
        </button>
        {!isSelf && (
          <button type="button" className="btn ghost danger-text" disabled={save.isPending} onClick={toggleActive}>
            {account.is_active ? "Deactivate" : "Reactivate"}
          </button>
        )}
      </div>
    </form>
  );
}
