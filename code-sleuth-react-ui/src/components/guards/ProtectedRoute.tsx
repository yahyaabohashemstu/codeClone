import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isLoading, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const loadingLabel = language === "ar" ? "جارٍ تحميل مساحة العمل..." : "Loading your workspace…";

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          {loadingLabel}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
