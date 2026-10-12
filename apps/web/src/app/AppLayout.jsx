import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext.jsx";
import { actionsApi } from "../features/actions/api.js";
import { navGroups } from "./navItems.jsx";
import Icon from "./Icon.jsx";

const ROLE_LABEL = { principal: "Principal", admin: "Admin", accountant: "Accountant", teacher: "Teacher" };

function useToday(timeZone) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: timeZone || undefined,
  }).format(new Date());
}

export default function AppLayout() {
  const { user, logout, can, school } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const today = useToday(school?.timezone);

  // Waiting approvals, shown next to "Approvals" for people who draft or approve.
  const { data: pending = [] } = useQuery({
    queryKey: ["actions", "pending"],
    queryFn: () => actionsApi.list("pending"),
    enabled: can("messages:draft"),
    refetchInterval: 60_000,
  });
  const waiting = pending.filter((a) => a.can_approve).length;

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menuOpen]);

  return (
    <div className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
      <aside className="sidebar" aria-label="Main">
        <div className="sidebar__brand">
          <span className="sidebar__school">{school?.name ?? "School"}</span>
          <span className="sidebar__product">EduManage</span>
        </div>

        <nav className="sidebar__nav">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => can(item.permission));
            if (!items.length) return null;
            return (
              <div key={group.label} className="nav-group">
                <span className="nav-group__label">{group.label}</span>
                {items.map((item) => (
                  <NavLink key={item.path} to={item.path} className="nav-item">
                    <Icon name={item.icon} />
                    <span className="nav-label">{item.label}</span>
                    {item.badge === "pending" && waiting > 0 && (
                      <span className="nav-count" aria-label={`${waiting} waiting`}>
                        {waiting}
                      </span>
                    )}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar__footer">
          <NavLink to="/account" className="sidebar__user" title="My account">
            <span className="user-badge" aria-hidden="true">
              {user?.username?.[0] ?? "?"}
            </span>
            <span className="user-name">
              {user?.username ?? "Signed in"}
              <small className="user-role">{ROLE_LABEL[user?.role] ?? user?.role}</small>
            </span>
          </NavLink>
          <button type="button" className="sidebar__signout" onClick={logout}>
            <Icon name="signout" size={16} />
            Sign out
          </button>
        </div>
      </aside>
      <button
        type="button"
        className="scrim"
        aria-label="Close menu"
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} size={20} />
          </button>
          <span className="topbar__school">{school?.name}</span>
          <span className="topbar__date">{today}</span>
          {can("assistant:use") && location.pathname !== "/ai-center" && (
            <NavLink to="/ai-center" className="topbar__ask">
              <Icon name="assistant" size={16} />
              Ask the assistant
            </NavLink>
          )}
        </header>

        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
