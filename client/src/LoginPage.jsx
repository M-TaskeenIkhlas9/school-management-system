import { useState } from "react";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("authUser", JSON.stringify(data.user));
      onLogin(data.token, data.user);
    } catch {
      setError("Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-dot" />
          <div>
            <h1>EduManage AI</h1>
            <p>Smart School Control Center</p>
          </div>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <h2>Principal Login</h2>
          <p className="login-subtitle">Sign in to manage your school</p>
          {error && <div className="login-error">{error}</div>}
          <label>
            Email
            <input
              type="email"
              placeholder="admin@school.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn primary login-btn" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
          {import.meta.env.DEV && (
            <button
              type="button"
              className="btn ghost login-btn"
              style={{ marginTop: 8 }}
              disabled={loading}
              onClick={async () => {
                setError("");
                setLoading(true);
                setEmail("admin@school.com");
                setPassword("admin123");
                try {
                  const res = await fetch("/api/auth/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: "admin@school.com", password: "admin123" }),
                  });
                  const data = await res.json();
                  if (!res.ok) {
                    setError(data.error || "Login failed. Is the backend running on port 4000?");
                    return;
                  }
                  localStorage.setItem("authToken", data.token);
                  localStorage.setItem("authUser", JSON.stringify(data.user));
                  onLogin(data.token, data.user);
                } catch {
                  setError("Cannot connect to server. Start the backend with: npm run dev (in server folder)");
                } finally {
                  setLoading(false);
                }
              }}
            >
              Quick login (dev)
            </button>
          )}
          <p className="login-hint">Default: admin@school.com / admin123</p>
        </form>
      </div>
    </div>
  );
}
