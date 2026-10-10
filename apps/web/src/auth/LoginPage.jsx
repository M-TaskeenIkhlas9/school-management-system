import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

const DEV_EMAIL = "admin@school.com";
const DEV_PASSWORD = "admin123";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const signIn = async (emailValue, passwordValue) => {
    setError("");
    setLoading(true);
    try {
      await login(emailValue, passwordValue);
      navigate(location.state?.from || "/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    signIn(email, password);
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
            <>
              <button
                type="button"
                className="btn ghost login-btn"
                style={{ marginTop: 8 }}
                disabled={loading}
                onClick={() => {
                  setEmail(DEV_EMAIL);
                  setPassword(DEV_PASSWORD);
                  signIn(DEV_EMAIL, DEV_PASSWORD);
                }}
              >
                Quick login (dev)
              </button>
              <p className="login-hint">Dev default: {DEV_EMAIL} / {DEV_PASSWORD}</p>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
