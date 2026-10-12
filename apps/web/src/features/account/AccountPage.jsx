import { useState } from "react";
import PageHeader from "../../components/PageHeader.jsx";
import { api } from "../../api/client.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import { ROLE_LABEL } from "../users/labels.js";
import "../users/users.css";

const empty = { current_password: "", new_password: "", confirm: "" };

/** The signed-in person's own account: who they are and changing their password. */
export default function AccountPage() {
  const { user, replaceToken } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.new_password !== form.confirm) return setError("The new passwords don't match.");
    setBusy(true);
    try {
      const { token } = await api.post("/auth/password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
      replaceToken(token);
      setForm(empty);
      toast.success("Password changed. Other devices were signed out.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <PageHeader title="My account" subtitle={`${user?.username ?? ""} · ${ROLE_LABEL[user?.role] ?? ""}`} />
      <div className="card account-page">
        <div className="card__title">
          <h4>Change password</h4>
        </div>
        <p className="muted">{user?.email}</p>
        <form className="account-form" onSubmit={submit}>
          <label className="account-form__wide">
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={set("current_password")}
              required
            />
          </label>
          <label>
            New password (8+ characters)
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.new_password}
              onChange={set("new_password")}
              required
            />
          </label>
          <label>
            Repeat new password
            <input
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.confirm}
              onChange={set("confirm")}
              required
            />
          </label>
          {error && (
            <p className="account-form__wide danger-text" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions account-form__wide">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Change password"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
