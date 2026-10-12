import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext.jsx";
import { actionsApi } from "../features/actions/api.js";
import { navGroups } from "./navItems.jsx";
import Icon from "./Icon.jsx";
import Avatar from "../components/Avatar.jsx";
import CommandPalette, { useCommandPaletteShortcut } from "../components/CommandPalette.jsx";
import { useTheme } from "../lib/theme.js";

const ROLE_LABEL = { principal: "Principal", admin: "Admin", accountant: "Accountant", teacher: "Teacher" };

function UserMenu({ user, onSignOut, theme, onToggleTheme }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (e.type === "keydown" ? e.key === "Escape" : !ref.current?.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="topbar__user"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user?.username} size={34} />
        <span className="topbar__user-name">{user?.username}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="menu__panel" role="menu">
          <div className="menu__who">
            <strong>{user?.username}</strong>
            <span>
              {ROLE_LABEL[user?.role]} · {user?.email}
            </span>
          </div>
          <Link to="/account" role="menuitem" className="menu__item" onClick={() => setOpen(false)}>
            <Icon name="users" size={16} /> My account
          </Link>
          <button type="button" role="menuitem" className="menu__item" onClick={onToggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={16} />
            {theme === "dark" ? "Light mode" : "Night mode"}
          </button>
          <button type="button" role="menuitem" className="menu__item menu__item--danger" onClick={onSignOut}>
            <Icon name="signout" size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout, can, school } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandPaletteShortcut(openSearch);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // Waiting approvals: the bell's dot and the count next to "Approvals".
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
        <Link to="/" className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <Icon name="logo" size={20} strokeWidth={2} />
          </span>
          EduManage
        </Link>

        <nav className="sidebar__nav">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => can(item.permission));
            if (!items.length) return null;
            return (
              <div key={group.label} className="nav-group">
                <span className="nav-group__label">{group.label}</span>
                {items.map((item) => (
                  <NavLink key={item.path} to={item.path} className="nav-item">
                    <Icon name={item.icon} size={19} />
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
          <div className="school-card">
            <span className="school-card__label">School</span>
            <strong>{school?.name ?? "—"}</strong>
            <span className="school-card__meta">
              {school?.currency} · {school?.timezone?.split("/").pop()?.replace("_", " ")}
            </span>
          </div>
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
          <button type="button" className="topbar__search" onClick={openSearch}>
            <Icon name="search" size={18} />
            <span>Search students, pages, or ask a question…</span>
            <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>
          <div className="topbar__right">
            {can("messages:draft") && (
              <Link
                to="/approvals"
                className="icon-button"
                aria-label={waiting ? `${waiting} waiting for your approval` : "Approvals"}
                title={waiting ? `${waiting} waiting for your approval` : "Nothing waiting"}
              >
                <Icon name="bell" size={20} />
                {waiting > 0 && <span className="icon-button__dot" />}
              </Link>
            )}
            <UserMenu user={user} onSignOut={logout} theme={theme} onToggleTheme={toggleTheme} />
          </div>
        </header>

        <main className="content" id="main">
          <Outlet />
        </main>
        {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      </div>
    </div>
  );
}
