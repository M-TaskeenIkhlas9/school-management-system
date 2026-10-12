import { Fragment, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";
import { api } from "../api/client.js";
import Icon from "../app/Icon.jsx";

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
  const [school, setSchool] = useState(null);

  useEffect(() => {
    api
      .get("/auth/school")
      .then(setSchool)
      .catch(() => setSchool(null));
  }, []);

  const signIn = async (emailValue, passwordValue) => {
    setError("");
    setLoading(true);
    try {
      await login(emailValue, passwordValue);
      navigate(location.state?.from || "/", { replace: true }); // "/" goes to the first page this role may open
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    signIn(email, password);
  };

  return (
    <div className="login-page">
      <section className="login-cover" aria-hidden={!school}>
        <span className="login-cover__product">
          <span className="sidebar__logo" aria-hidden="true">
            <Icon name="logo" size={20} strokeWidth={2} />
          </span>
          EduManage
        </span>
        <div>
          <h1 className="login-cover__school" aria-label={school?.name}>
            {(school?.name ?? "\u00a0").split(" ").map((word, i) => (
              <Fragment key={`${word}-${i}`}>
                {i > 0 && " "}
                <span className="login-cover__word" style={{ "--i": i }}>
                  <span>{word}</span>
                </span>
              </Fragment>
            ))}
          </h1>
          <p className="login-cover__line">
            Attendance, fees, results and messages to parents — with an AI assistant that prepares the work for you.
          </p>
        </div>
        <ul className="login-features">
          {[
            ["attendance", "Daily attendance"],
            ["fees", "Fees & reminders"],
            ["results", "Results & report cards"],
            ["sparkle", "AI assistant"],
          ].map(([icon, label], i) => (
            <li key={label} style={{ "--i": i }}>
              <Icon name={icon} size={18} /> {label}
            </li>
          ))}
        </ul>
      </section>

      <section className="login-sheet">
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h2>Welcome back</h2>
          <p className="login-subtitle">Sign in with the email and password the school office gave you.</p>
          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button type="submit" className="btn primary login-btn" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
          {import.meta.env.DEV && (
            <div className="login-dev">
              <button
                type="button"
                className="btn link"
                disabled={loading}
                onClick={() => {
                  setEmail(DEV_EMAIL);
                  setPassword(DEV_PASSWORD);
                  signIn(DEV_EMAIL, DEV_PASSWORD);
                }}
              >
                Quick login (dev)
              </button>
              <span>
                {DEV_EMAIL} / {DEV_PASSWORD}
              </span>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
