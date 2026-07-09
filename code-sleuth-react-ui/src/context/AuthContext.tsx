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
  login: (username: string, password: string) => Promise<{ twofaRequired: boolean; twofaToken?: string }>;
  complete2faLogin: (token: string, code: string) => Promise<void>;
  setup2fa: () => Promise<{ secret: string; otpauthUri: string }>;
  enable2fa: (code: string) => Promise<string[]>;
  disable2fa: (password: string, code: string) => Promise<void>;
  logoutAll: () => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  signup: (username: string, email: string, password: string) => Promise<{ verificationRequired: boolean }>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  verifyEmail: (token: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
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
    const result = await apiFetch<{
      success: boolean; user?: UserSummary; csrfToken?: string;
      twofaRequired?: boolean; twofaToken?: string;
    }>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (result.twofaRequired) {
      // Password accepted; a second factor is required before a session exists.
      return { twofaRequired: true, twofaToken: result.twofaToken };
    }
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
    await refreshSession();
    return { twofaRequired: false };
  }, [refreshSession]);

  const complete2faLogin = useCallback(async (token: string, code: string) => {
    const result = await apiFetch<{ success: boolean; csrfToken?: string }>("/api/v1/auth/2fa/login", {
      method: "POST",
      body: JSON.stringify({ token, code: code.trim() }),
    });
    if (result.csrfToken) {
      setCsrfToken(result.csrfToken);
    }
    await refreshSession();
  }, [refreshSession]);

  const setup2fa = useCallback(async () => {
    const res = await apiFetch<{ success: boolean; secret: string; otpauthUri: string }>("/api/v1/auth/2fa/setup", {
      method: "POST",
    });
    return { secret: res.secret, otpauthUri: res.otpauthUri };
  }, []);

  const enable2fa = useCallback(async (code: string) => {
    const res = await apiFetch<{ success: boolean; recoveryCodes: string[] }>("/api/v1/auth/2fa/enable", {
      method: "POST",
      body: JSON.stringify({ code: code.trim() }),
    });
    await refreshSession();
    return res.recoveryCodes;
  }, [refreshSession]);

  const disable2fa = useCallback(async (password: string, code: string) => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/2fa/disable", {
      method: "POST",
      body: JSON.stringify({ password, code: code.trim() }),
    });
    await refreshSession();
  }, [refreshSession]);

  const logoutAll = useCallback(async () => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/logout-all", { method: "POST" });
    const nextSession = await refreshSession();
    setSession(nextSession);
  }, [refreshSession]);

  const register = useCallback(async (username: string, password: string) => {
    const result = await apiFetch<{ success: boolean; user: UserSummary; csrfToken: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setCsrfToken(result.csrfToken);
    await refreshSession();
  }, [refreshSession]);

  const signup = useCallback(async (username: string, email: string, password: string) => {
    const result = await apiFetch<{
      success: boolean; verificationRequired?: boolean; csrfToken?: string;
    }>("/api/v1/auth/signup", {
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
    await apiFetch<{ success: boolean }>("/api/v1/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email: email.trim() }),
    });
  }, []);

  const resetPassword = useCallback(async (token: string, password: string) => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  }, []);

  const verifyEmail = useCallback(async (token: string) => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: email.trim() }),
    });
  }, []);

  const logout = useCallback(async () => {
    await apiFetch<{ success: boolean }>("/api/v1/auth/logout", { method: "POST" });
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
    complete2faLogin,
    setup2fa,
    enable2fa,
    disable2fa,
    logoutAll,
    register,
    signup,
    requestPasswordReset,
    resetPassword,
    verifyEmail,
    resendVerification,
    logout,
  }), [isLoading, session, refreshSession, login, complete2faLogin, setup2fa, enable2fa, disable2fa, logoutAll, register, signup, requestPasswordReset, resetPassword, verifyEmail, resendVerification, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
