"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@lib/api";

export interface AuthState {
  token: string | null;
  user: { email?: string; name?: string } | null;
  theme: "light" | "dark";
}

interface AuthContextValue extends AuthState {
  login: (
    token: string,
    user?: { email?: string; name?: string; themePreference?: string | null },
  ) => void;
  logout: () => void;
  toggleTheme: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    return (localStorage.getItem("theme") as "light" | "dark") || "light";
  });

  // Load stored auth
  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedToken = localStorage.getItem("authToken");
    if (savedToken) setToken(savedToken);
    const savedUser = localStorage.getItem("authUser");
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
  }, []);

  // Apply theme to document root
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("theme", theme);
    }
  }, [theme]);
  // Persist theme if logged in
  useEffect(() => {
    if (token) {
      (async () => {
        try {
          await api.saveTheme(theme);
        } catch {
          /* ignore save error to avoid breaking UI */
        }
      })();
    }
  }, [theme, token]);

  const login = (
    t: string,
    u?: { email?: string; name?: string; themePreference?: string | null },
  ) => {
    setToken(t);
    if (u) setUser({ email: u.email, name: u.name });
    if (u?.themePreference && (u.themePreference === "light" || u.themePreference === "dark")) {
      setTheme(u.themePreference);
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("authToken", t);
      if (u) localStorage.setItem("authUser", JSON.stringify(u));
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        if (typeof document !== "undefined") {
          document.documentElement.dataset.theme = next;
        }
      } catch {}
      return next;
    });
  };

  return (
    <AuthContext.Provider value={{ token, user, theme, login, logout, toggleTheme }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
