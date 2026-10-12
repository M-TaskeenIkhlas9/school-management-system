import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, session, SESSION_EXPIRED_EVENT } from "../api/client.js";
import { setCurrency } from "../lib/format.js";

/** Permissions, classes and school facts from a login or /auth/me response. */
function accessFrom(data) {
  setCurrency(data.school?.currency);
  return { permissions: data.permissions, classIds: data.classIds, school: data.school ?? null };
}

const AuthContext = createContext(null);

/**
 * Signed-in state: the stored token/user plus what this user may do.
 * Permissions come from the login response and are refreshed from /auth/me on
 * page load, so a role change applies without signing in again. The server
 * still enforces every permission; this only decides what to show.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(() => session.load());
  const [access, setAccess] = useState(null); // { permissions: string[], classIds: number[] | null }

  const clearState = useCallback(() => {
    queryClient.clear();
    setCurrent(null);
    setAccess(null);
  }, [queryClient]);

  const logout = useCallback(() => {
    session.clear();
    clearState();
  }, [clearState]);

  useEffect(() => {
    window.addEventListener(SESSION_EXPIRED_EVENT, clearState);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, clearState);
  }, [clearState]);

  // Load permissions for a stored session (page reload).
  useEffect(() => {
    if (!current?.token || access) return;
    let cancelled = false;
    api
      .get("/auth/me")
      .then((me) => {
        if (cancelled) return;
        session.save(current.token, me.user);
        setCurrent({ token: current.token, user: me.user });
        setAccess(accessFrom(me));
      })
      .catch(() => {
        // 401 is handled by the session-expired event; anything else: sign out safely.
        if (!cancelled) logout();
      });
    return () => {
      cancelled = true;
    };
  }, [current, access, logout]);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    session.save(data.token, data.user);
    setCurrent({ token: data.token, user: data.user });
    setAccess(accessFrom(data));
  }, []);

  /** Keep this browser signed in after a password change (the server issued a new token). */
  const replaceToken = useCallback((token) => {
    setCurrent((prev) => {
      session.save(token, prev?.user ?? null);
      return { token, user: prev?.user ?? null };
    });
  }, []);

  const value = useMemo(() => {
    const permissions = new Set(access?.permissions ?? []);
    return {
      user: current?.user ?? null,
      isAuthenticated: Boolean(current?.token),
      isReady: Boolean(current?.token && access),
      classIds: access?.classIds ?? null,
      school: access?.school ?? null,
      can: (permission) => permissions.has(permission),
      login,
      logout,
      replaceToken,
    };
  }, [current, access, login, logout, replaceToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
