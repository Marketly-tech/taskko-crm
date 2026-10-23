import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, formatApiError, ORG_KEY } from "@/lib/api";

// Super Admin acts as an admin inside whichever organisation is active.
const normalize = (u) => (u && u.role === "super_admin" ? { ...u, role: "admin", is_super_admin: true } : u);

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=logged out
  const [error, setError] = useState("");

  const bootstrap = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(normalize(data));
    } catch (e) {
      // /auth/me failed — the axios 401 interceptor already attempted a
      // refresh once; if we're still here, the session is truly gone.
      setUser(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (email, password) => {
    setError("");
    try {
      localStorage.removeItem(ORG_KEY);
      await api.post("/auth/login", { email, password });
      const { data } = await api.get("/auth/me");
      setUser(normalize(data));
      return true;
    } catch (e) {
      setError(formatApiError(e.response?.data?.detail) || e.message);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    localStorage.removeItem(ORG_KEY);
    setUser(false);
  };

  return (
    <AuthCtx.Provider value={{ user, setUser: (u) => setUser(normalize(u)), login, logout, error }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
