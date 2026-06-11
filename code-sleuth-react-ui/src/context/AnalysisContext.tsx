import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { AnalysisProgressResponse, AnalysisResult } from "@/types/api";

interface AnalysisContextValue {
  currentResult: AnalysisResult | null;
  isAnalyzing: boolean;
  analysisProgress: AnalysisProgressResponse | null;
  setCurrentResult: (result: AnalysisResult | null) => void;
  analyze: (formData: FormData) => Promise<AnalysisResult>;
  loadCurrent: () => Promise<AnalysisResult | null>;
  loadById: (analysisId: number) => Promise<AnalysisResult>;
  rerunById: (analysisId: number) => Promise<AnalysisResult>;
  clearCurrentResult: () => void;
}

type AnalysisState = {
  ownerUserId: number | null;
  result: AnalysisResult | null;
};

// Branded storage key; "project22.*" was the scaffold-era prefix.
const STORAGE_KEY_PREFIX = "codesimilar.currentAnalysis";
const LEGACY_STORAGE_KEY = "project22.currentAnalysis";
const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 1000;
const SLOW_POLL_INTERVAL_MS = 3000;
const SLOW_POLL_AFTER_ERRORS = 5;
const MAX_CONSECUTIVE_POLL_ERRORS = 15;

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function getStorageKey(userId: number) {
  return `${STORAGE_KEY_PREFIX}.${userId}`;
}

function loadStoredAnalysis(userId: number | null): AnalysisResult | null {
  if (!userId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(getStorageKey(userId));
    if (raw) {
      return JSON.parse(raw) as AnalysisResult;
    }
    // One-time migration from the legacy per-user key.
    const legacyRaw = sessionStorage.getItem(`${LEGACY_STORAGE_KEY}.${userId}`);
    if (legacyRaw) {
      sessionStorage.setItem(getStorageKey(userId), legacyRaw);
      sessionStorage.removeItem(`${LEGACY_STORAGE_KEY}.${userId}`);
      return JSON.parse(legacyRaw) as AnalysisResult;
    }
    return null;
  } catch {
    return null;
  }
}

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const previousUserIdRef = useRef<number | null>(null);
  const [analysisState, setAnalysisState] = useState<AnalysisState>({ ownerUserId: null, result: null });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressResponse | null>(null);
  const pollTokenRef = useRef<{ cancelled: boolean } | null>(null);

  const setCurrentResult = useCallback((result: AnalysisResult | null) => {
    const ownerUserId = isAuthenticated && user?.id ? user.id : null;
    setAnalysisState({ ownerUserId, result });
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    sessionStorage.removeItem(LEGACY_STORAGE_KEY);

    const nextUserId = isAuthenticated && user?.id ? user.id : null;
    const previousUserId = previousUserIdRef.current;

    if (!nextUserId) {
      if (previousUserId) {
        sessionStorage.removeItem(getStorageKey(previousUserId));
      }
      previousUserIdRef.current = null;
      setAnalysisState({ ownerUserId: null, result: null });
      return;
    }

    previousUserIdRef.current = nextUserId;
    setAnalysisState({ ownerUserId: nextUserId, result: loadStoredAnalysis(nextUserId) });
  }, [isAuthLoading, isAuthenticated, user?.id]);

  useEffect(() => {
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);

    if (!analysisState.ownerUserId) {
      return;
    }

    const storageKey = getStorageKey(analysisState.ownerUserId);
    if (analysisState.result) {
      sessionStorage.setItem(storageKey, JSON.stringify(analysisState.result));
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }, [analysisState]);

  // A single, robust polling state machine shared by analyze() and rerunById().
  // `submit` performs the POST that enqueues the background task (HTTP 202); the
  // loop then polls progress until the task completes or fails. A cancellation
  // token ensures a superseding run cleanly takes over the shared UI state and
  // that unmounting stops the loop without leaking timers or setState calls.
  const runWithPolling = useCallback(
    async (submit: () => Promise<unknown>): Promise<AnalysisResult> => {
      if (pollTokenRef.current) {
        pollTokenRef.current.cancelled = true;
      }
      const token = { cancelled: false };
      pollTokenRef.current = token;

      const cleanup = () => {
        if (pollTokenRef.current === token) {
          pollTokenRef.current = null;
          setIsAnalyzing(false);
          setAnalysisProgress(null);
        }
      };

      setIsAnalyzing(true);
      setAnalysisProgress({ stage: "Starting analysis...", progress: 0, timestamp: new Date().toISOString() });

      try {
        await submit();

        let consecutiveErrors = 0;
        for (;;) {
          await delay(consecutiveErrors > SLOW_POLL_AFTER_ERRORS ? SLOW_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
          if (token.cancelled) {
            throw new ApiError("Analysis superseded by a newer run.", 0, null);
          }

          let progress: AnalysisProgressResponse;
          try {
            progress = await apiFetch<AnalysisProgressResponse>("/api/analysis/progress");
            consecutiveErrors = 0;
          } catch {
            consecutiveErrors += 1;
            if (consecutiveErrors >= MAX_CONSECUTIVE_POLL_ERRORS) {
              throw new Error("Lost connection to the server during analysis.");
            }
            continue;
          }

          if (token.cancelled) {
            throw new ApiError("Analysis superseded by a newer run.", 0, null);
          }
          setAnalysisProgress(progress);

          if (progress.taskStatus === "completed" && progress.taskId) {
            let result: AnalysisResult;
            try {
              result = await apiFetch<AnalysisResult>(`/api/analysis/task/${progress.taskId}`);
            } catch {
              throw new Error("Failed to retrieve analysis results.");
            }
            setCurrentResult(result);
            cleanup();
            return result;
          }

          if (progress.taskStatus === "failed" && progress.taskId) {
            // Best-effort: consume the failed task so the server clears it.
            await apiFetch(`/api/analysis/task/${progress.taskId}`).catch(() => undefined);
            throw new Error("Analysis failed. Please try again.");
          }
        }
      } catch (error) {
        cleanup();
        throw error;
      }
    },
    [setCurrentResult],
  );

  const analyze = useCallback(
    (formData: FormData) =>
      runWithPolling(() =>
        apiFetch<{ taskId: string; status: string }>("/api/analysis", {
          method: "POST",
          body: formData,
        }),
      ),
    [runWithPolling],
  );

  const loadCurrent = useCallback(async () => {
    try {
      const result = await apiFetch<AnalysisResult>("/api/analysis/current");
      setCurrentResult(result);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setCurrentResult(null);
        return null;
      }
      if (error instanceof ApiError && error.status === 401) {
        setCurrentResult(null);
      }
      throw error;
    }
  }, [setCurrentResult]);

  const loadById = useCallback(async (analysisId: number) => {
    const result = await apiFetch<AnalysisResult>(`/api/analysis/${analysisId}`);
    setCurrentResult(result);
    return result;
  }, [setCurrentResult]);

  const rerunById = useCallback(
    (analysisId: number) =>
      runWithPolling(() =>
        apiFetch<{ taskId: string; status: string }>(`/api/history/${analysisId}/rerun`, {
          method: "POST",
        }),
      ),
    [runWithPolling],
  );

  const clearCurrentResult = useCallback(() => {
    setCurrentResult(null);
  }, [setCurrentResult]);

  useEffect(() => {
    return () => {
      if (pollTokenRef.current) {
        pollTokenRef.current.cancelled = true;
      }
    };
  }, []);

  const value = useMemo<AnalysisContextValue>(
    () => ({
      currentResult: analysisState.result,
      isAnalyzing,
      analysisProgress,
      setCurrentResult,
      analyze,
      loadCurrent,
      loadById,
      rerunById,
      clearCurrentResult,
    }),
    [analysisState.result, isAnalyzing, analysisProgress, setCurrentResult, analyze, loadCurrent, loadById, rerunById, clearCurrentResult],
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error("useAnalysis must be used within an AnalysisProvider");
  }
  return context;
}
