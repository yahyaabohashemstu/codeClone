import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DocumentTitleSync } from "@/components/common/DocumentTitleSync";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AnalysisProvider } from "@/context/AnalysisContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProtectedRoute } from "@/components/guards/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import { CookieConsent } from "@/components/common/CookieConsent";

const Home = lazy(() => import("@/pages/Home"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Results = lazy(() => import("@/pages/Results"));
const Auth = lazy(() => import("@/pages/Auth"));
const VerifyEmail = lazy(() => import("@/pages/VerifyEmail"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Chat = lazy(() => import("@/pages/Chat"));
const Billing = lazy(() => import("@/pages/Billing"));
const ApiKeys = lazy(() => import("@/pages/ApiKeys"));
const Settings = lazy(() => import("@/pages/Settings"));
const Admin = lazy(() => import("@/pages/Admin"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Status = lazy(() => import("@/pages/Status"));
const Help = lazy(() => import("@/pages/Help"));
const History = lazy(() => import("@/pages/History"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Workspaces = lazy(() => import("@/pages/enterprise/Workspaces"));
const WorkspaceDetail = lazy(() => import("@/pages/enterprise/WorkspaceDetail"));
const ReviewCases = lazy(() => import("@/pages/enterprise/ReviewCases"));
const CaseDetail = lazy(() => import("@/pages/enterprise/CaseDetail"));

const SuspenseFallback = () => (
  <div className="flex min-h-[60vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

// Keying the error boundary by pathname gives each route its own boundary
// instance, so a render error on one page resets when the user navigates away
// instead of permanently blanking the whole app shell.
const RoutedContent = () => {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<SuspenseFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/help" element={<Help />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/status" element={<Status />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/reset-password" element={<ResetPassword />} />
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
            path="/billing"
            element={
              <ProtectedRoute>
                <Billing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/api-keys"
            element={
              <ProtectedRoute>
                <ApiKeys />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAdmin>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enterprise/workspaces"
            element={
              <ProtectedRoute requireAdmin>
                <Workspaces />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enterprise/workspaces/:workspaceId"
            element={
              <ProtectedRoute requireAdmin>
                <WorkspaceDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enterprise/cases"
            element={
              <ProtectedRoute requireAdmin>
                <ReviewCases />
              </ProtectedRoute>
            }
          />
          <Route
            path="/enterprise/cases/:caseId"
            element={
              <ProtectedRoute requireAdmin>
                <CaseDetail />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};

const App = () => (
  <LanguageProvider>
    <ThemeProvider>
      <AuthProvider>
        <AnalysisProvider>
          <TooltipProvider>
            <Sonner />
            <BrowserRouter>
              <DocumentTitleSync />
              <MainLayout>
                <RoutedContent />
              </MainLayout>
              <CookieConsent />
            </BrowserRouter>
          </TooltipProvider>
        </AnalysisProvider>
      </AuthProvider>
    </ThemeProvider>
  </LanguageProvider>
);

export default App;
