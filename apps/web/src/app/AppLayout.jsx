import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { navItems } from "./navItems.jsx";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar__brand">
          <span className="brand-dot" />
          <div>
            <h1>EduManage AI</h1>
            <p>Smart School Control Center</p>
          </div>
        </div>
        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
              <span className={`nav-icon ${item.colorClass}`} aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="user-badge">{user?.username?.[0] || "P"}</span>
            <span className="user-name">{user?.username || "Principal"}</span>
          </div>
          <button className="collapse-btn" onClick={logout}>
            Logout
          </button>
          <button className="collapse-btn" onClick={() => setCollapsed((prev) => !prev)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">
            <h2>Cambridge Public School</h2>
            <div className="session-pill">Session: 2025-2026</div>
          </div>
          <div className="topbar__actions">
            <label className="search">
              <input type="search" placeholder="Search students, fees, exams..." />
            </label>
            <button className="icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.7V3a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h20v-1l-2-2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button className="icon-btn" aria-label="Settings" onClick={() => navigate("/settings")}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19.4 12.9c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2.1-1.6a.5.5 0 0 0 .12-.64l-2-3.4a.5.5 0 0 0-.6-.22l-2.5 1a7.2 7.2 0 0 0-1.6-.9l-.4-2.6a.5.5 0 0 0-.5-.42h-4a.5.5 0 0 0-.5.42l-.4 2.6a7.2 7.2 0 0 0-1.6.9l-2.5-1a.5.5 0 0 0-.6.22l-2 3.4a.5.5 0 0 0 .12.64l2.1 1.6c-.04.3-.06.6-.06.9s.02.6.06.9l-2.1 1.6a.5.5 0 0 0-.12.64l2 3.4a.5.5 0 0 0 .6.22l2.5-1c.5.36 1.04.66 1.6.9l.4 2.6a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.4-2.6c.56-.24 1.1-.54 1.6-.9l2.5 1a.5.5 0 0 0 .6-.22l2-3.4a.5.5 0 0 0-.12-.64l-2.1-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      <Link className="ai-fab" to="/ai-center" title="Ask AI Assistant">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <linearGradient id="ai-gradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dfe6ff" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="18" fill="url(#ai-gradient)" />
          <g fill="none" stroke="#4b5df3" strokeWidth="2" strokeLinecap="round">
            <circle cx="24" cy="24" r="7.5" />
            <path d="M24 12v5.5M24 30.5V36" />
            <path d="M12 24h5.5M30.5 24H36" />
            <path d="M16.5 16.5l3.8 3.8M27.7 27.7l3.8 3.8" />
            <path d="M31.5 16.5l-3.8 3.8M20.3 27.7l-3.8 3.8" />
          </g>
          <circle cx="24" cy="24" r="2.6" fill="#4b5df3" />
        </svg>
      </Link>
    </div>
  );
}
