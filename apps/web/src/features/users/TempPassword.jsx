import { useState } from "react";

/** A temporary password shown once, with a copy button. */
export default function TempPassword({ email, password, onDone }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="temp-password" role="status">
      <div>
        <strong>Give these sign-in details to the person</strong>
        <p className="muted">
          Shown only once. They can change the password from <em>My account</em> after signing in.
        </p>
      </div>
      <dl>
        <dt>Email</dt>
        <dd>{email}</dd>
        <dt>Password</dt>
        <dd>
          <code>{password}</code>
        </dd>
      </dl>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={copy}>
          {copied ? "Copied" : "Copy password"}
        </button>
        <button type="button" className="btn link" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
