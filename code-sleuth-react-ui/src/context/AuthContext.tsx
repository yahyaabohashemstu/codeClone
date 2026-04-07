import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setCsrfToken } from "@/lib/api";
import type { SessionResponse, UserSummary } from "@/types/api";

interface AuthContextValue {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: UserSummary | null;
  supportedLanguages: string[];
  aiStatus: SessionResponse["ai"] | null;
  refreshSession: () => Promise<SessionResponse>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchSession() {
  const response = await fetch("/api/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Session request failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Session response was not JSON");
  }

  const payload = (await response.json()) as SessionResponse;
  setCsrfToken(payload.csrfToken);
  return payload;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<SessionResponse | null>(null);

  const refreshSession = useCallback(async () => {
    const payload = await fetchSession();
    setSession(payload);
    return payload;
  }, []);

  useEffect(() => {
    refreshSession()
      .catch(() => {
        setSession({
          authenticated: false,
          user: null,
          csrfToken: "",
          supportedLanguages: [],
          ai: null,
        });
      })
      .finally(() => setIsLoading(false));
  }, [refreshSession]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await apiFetch<{ success: boolean; user: UserSummary; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setCsrfToken(result.csrfToken);
    await refreshSession();
  }, [refreshSession]);

  const register = useCallback(async (username: string, password: string) => {
    const result = await apiFetch<{ success: boolean; user: UserSummary; csrfToken: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setCsrfToken(result.csrfToken);
    await refreshSession();
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await apiFetch<{ success: boolean }>("/api/auth/logout", { method: "POST" });
    const nextSession = await refreshSession();
    setSession(nextSession);
  }, [refreshSession]);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isAuthenticated: Boolean(session?.authenticated),
    user: session?.user ?? null,
    supportedLanguages: session?.supportedLanguages ?? [],
    aiStatus: session?.ai ?? null,
    refreshSession,
    login,
    register,
    logout,
  }), [isLoading, session, refreshSession, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
