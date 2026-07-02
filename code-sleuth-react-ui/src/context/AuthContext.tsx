import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch, setCsrfToken, setUnauthorizedHandler } from "@/lib/api";
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
  signup: (username: string, email: string, password: string) => Promise<{ verificationRequired: boolean }>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
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

  // When any request 401s (session expired), clear local auth state so the
  // protected routes redirect to login instead of showing a stale shell.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setCsrfToken("");
      setSession({
        authenticated: false,
        user: null,
        csrfToken: "",
        supportedLanguages: [],
        ai: null,
      });
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    if (!username.trim() || !password) {
      throw new Error("Username and password are required.");
    }
    const result = await apiFetch<{ success: boolean; user: UserSummary; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
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

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const result = await apiFetch<{
      success: boolean; verificationRequired?: boolean; csrfToken?: string;
    }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), email: email.trim(), password }),
    });
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
    // When verification is not required the server signs the user in; refresh
    // the session so protected routes unlock.
    if (!result.verificationRequired) {
      await refreshSession();
    }
    return { verificationRequired: Boolean(result.verificationRequired) };
  }, [refreshSession]);

  const requestPasswordReset = useCallback(async (email: string) => {
    await apiFetch<{ success: boolean }>("/api/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: email.trim() }),
    });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await apiFetch<{ success: boolean }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    await apiFetch<{ success: boolean }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }, []);

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
    signup,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    logout,
  }), [isLoading, session, refreshSession, login, register, signup, requestPasswordReset, resetPassword, verifyEmail, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
