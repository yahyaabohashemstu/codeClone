import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin }: ProtectedRouteProps) {
  const location = useLocation();
  const { isLoading, isAuthenticated, user } = useAuth();
  const { t } = useTranslation("common");

  // Explain the redirect instead of silently bouncing non-admins home.
  const adminBlocked = !isLoading && isAuthenticated && requireAdmin && !user?.is_admin;
  useEffect(() => {
    if (adminBlocked) {
      toast.error(t("guard.adminRequired", { defaultValue: "This area requires administrator access." }));
    }
  }, [adminBlocked, t]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" aria-hidden="true" />
          {t("guard.loadingWorkspace")}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireAdmin && !user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
