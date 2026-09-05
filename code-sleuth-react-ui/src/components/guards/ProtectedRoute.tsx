import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@/components/common/PageLoader";

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
    return <PageLoader message={t("guard.loadingWorkspace")} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requireAdmin && !user?.is_admin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
