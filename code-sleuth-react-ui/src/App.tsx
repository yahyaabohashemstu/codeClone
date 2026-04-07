import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DocumentTitleSync } from "@/components/common/DocumentTitleSync";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AnalysisProvider } from "@/context/AnalysisContext";
import { LanguageProvider } from "@/context/LanguageContext";
import { ProtectedRoute } from "@/components/guards/ProtectedRoute";
import { MainLayout } from "@/components/layout/MainLayout";
import Home from "@/pages/Home";
import Analysis from "@/pages/Analysis";
import Analytics from "@/pages/Analytics";
import Results from "@/pages/Results";
import Auth from "@/pages/Auth";
import Chat from "@/pages/Chat";
import Help from "@/pages/Help";
import History from "@/pages/History";
import NotFound from "@/pages/NotFound";
import Workspaces from "@/pages/enterprise/Workspaces";
import WorkspaceDetail from "@/pages/enterprise/WorkspaceDetail";
import ReviewCases from "@/pages/enterprise/ReviewCases";
import CaseDetail from "@/pages/enterprise/CaseDetail";

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
