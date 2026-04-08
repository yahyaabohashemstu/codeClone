import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DocumentTitleSync } from "@/components/common/DocumentTitleSync";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AnalysisProvider } from "@/context/AnalysisContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProtectedRoute } from "@/components/guards/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";

const Home = lazy(() => import("@/pages/Home"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Results = lazy(() => import("@/pages/Results"));
const Auth = lazy(() => import("@/pages/Auth"));
const Chat = lazy(() => import("@/pages/Chat"));
const Help = lazy(() => import("@/pages/Help"));
const History = lazy(() => import("@/pages/History"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Workspaces = lazy(() => import("@/pages/enterprise/Workspaces"));
const WorkspaceDetail = lazy(() => import("@/pages/enterprise/WorkspaceDetail"));
const ReviewCases = lazy(() => import("@/pages/enterprise/ReviewCases"));
const CaseDetail = lazy(() => import("@/pages/enterprise/CaseDetail"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <AnalysisProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <DocumentTitleSync />
                <MainLayout>
                  <ErrorBoundary>
                  <Suspense fallback={
                    <div className="flex min-h-[60vh] items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                    </div>
                  }>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/help" element={<Help />} />
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/login" element={<Auth />} />
                    <Route
                      path="/analysis"
                      element={
                        <ProtectedRoute>
                          <Analysis />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/results"
                      element={
                        <ProtectedRoute>
                          <Results />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/history"
                      element={
                        <ProtectedRoute>
                          <History />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/analytics"
                      element={
                        <ProtectedRoute>
                          <Analytics />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/chat"
                      element={
                        <ProtectedRoute>
                          <Chat />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/enterprise/workspaces"
                      element={
                        <ProtectedRoute>
                          <Workspaces />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/enterprise/workspaces/:workspaceId"
                      element={
                        <ProtectedRoute>
                          <WorkspaceDetail />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/enterprise/cases"
                      element={
                        <ProtectedRoute>
                          <ReviewCases />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/enterprise/cases/:caseId"
                      element={
                        <ProtectedRoute>
                          <CaseDetail />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                  </ErrorBoundary>
                </MainLayout>
              </BrowserRouter>
            </TooltipProvider>
          </AnalysisProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
