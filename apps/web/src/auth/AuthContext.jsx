import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, session, SESSION_EXPIRED_EVENT } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(() => session.load());

  const logout = useCallback(() => {
    session.clear();
    queryClient.clear();
    setCurrent(null);
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      setCurrent(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    session.save(data.token, data.user);
    setCurrent({ token: data.token, user: data.user });
  }, []);

  const value = useMemo(
    () => ({ user: current?.user ?? null, isAuthenticated: Boolean(current?.token), login, logout }),
    [current, login, logout]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
