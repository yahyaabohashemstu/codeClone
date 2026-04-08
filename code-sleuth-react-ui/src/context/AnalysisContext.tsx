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

const LEGACY_STORAGE_KEY = "project22.currentAnalysis";
const AnalysisContext = createContext<AnalysisContextValue | undefined>(undefined);

function getStorageKey(userId: number) {
  return `${LEGACY_STORAGE_KEY}.${userId}`;
}

function loadStoredAnalysis(userId: number | null): AnalysisResult | null {
  if (!userId) {
    return null;
  }

  try {
    const raw = sessionStorage.getItem(getStorageKey(userId));
    return raw ? (JSON.parse(raw) as AnalysisResult) : null;
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
  const progressPollRef = useRef<number | null>(null);

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

  const analyze = useCallback(async (formData: FormData) => {
    setIsAnalyzing(true);
    setAnalysisProgress({ stage: "Starting analysis...", progress: 0, timestamp: new Date().toISOString() });

    if (progressPollRef.current !== null) {
      clearTimeout(progressPollRef.current);
      progressPollRef.current = null;
    }

    // Submit analysis -- returns immediately with taskId (HTTP 202)
    await apiFetch<{ taskId: string; status: string }>("/api/analysis", {
      method: "POST",
      body: formData,
    });

    // Poll for progress and completion
    return new Promise<AnalysisResult>((resolve, reject) => {
      const schedulePoll = () => {
        progressPollRef.current = window.setTimeout(async () => {
          try {
            const progress = await apiFetch<AnalysisProgressResponse>("/api/analysis/progress");
            setAnalysisProgress(progress);

            if (progress.taskStatus === "completed" && progress.taskId) {
              // Fetch the result
              try {
                const result = await apiFetch<AnalysisResult>(`/api/analysis/task/${progress.taskId}`);
                setCurrentResult(result);
                setIsAnalyzing(false);
                if (progressPollRef.current !== null) {
                  clearTimeout(progressPollRef.current);
                  progressPollRef.current = null;
                }
                setAnalysisProgress(null);
                resolve(result);
                return;
              } catch {
                setIsAnalyzing(false);
                if (progressPollRef.current !== null) {
                  clearTimeout(progressPollRef.current);
                  progressPollRef.current = null;
                }
                setAnalysisProgress(null);
                reject(new Error("Failed to retrieve analysis results."));
                return;
              }
            }

            if (progress.taskStatus === "failed" && progress.taskId) {
              // Clean up the failed task by fetching it (server removes it on fetch)
              try {
                await apiFetch(`/api/analysis/task/${progress.taskId}`);
              } catch {
                // ignore cleanup errors
              }
              setIsAnalyzing(false);
              if (progressPollRef.current !== null) {
                clearTimeout(progressPollRef.current);
                progressPollRef.current = null;
              }
              setAnalysisProgress(null);
              reject(new Error("Analysis failed. Please try again."));
              return;
            }
          } catch {
            // ignore polling errors
          }

          if (progressPollRef.current !== null) {
            schedulePoll();
          }
        }, 1000);
      };

      schedulePoll();
    });
  }, [setCurrentResult]);

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

  const rerunById = useCallback(async (analysisId: number) => {
    const result = await apiFetch<AnalysisResult>(`/api/history/${analysisId}/rerun`, {
      method: "POST",
    });
    setCurrentResult(result);
    return result;
  }, [setCurrentResult]);

  const clearCurrentResult = useCallback(() => {
    setCurrentResult(null);
  }, [setCurrentResult]);

  useEffect(() => {
    return () => {
      if (progressPollRef.current !== null) {
        clearTimeout(progressPollRef.current);
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
