import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  GitCompare,
  HelpCircle,
  History,
  Home,
  KeyRound,
  LogIn,
  LogOut,
  MessageSquare,
  LineChart,
  Scale,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ControlStrip, RegMark } from "@/components/dossier/Dossier";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

function isActivePath(currentPath: string, itemPath: string) {
  return currentPath === itemPath;
}

interface NavItem {
  labelKey: string;
  icon: typeof Home;
  path: string;
}

const navItems: NavItem[] = [
  { labelKey: "nav.home", icon: Home, path: "/" },
  { labelKey: "nav.analysis", icon: GitCompare, path: "/analysis" },
  { labelKey: "nav.results", icon: BarChart3, path: "/results" },
  { labelKey: "nav.history", icon: History, path: "/history" },
  { labelKey: "nav.analytics", icon: LineChart, path: "/analytics" },
  { labelKey: "nav.chat", icon: MessageSquare, path: "/chat" },
  { labelKey: "nav.billing", icon: CreditCard, path: "/billing" },
  { labelKey: "nav.apiKeys", icon: KeyRound, path: "/api-keys" },
  { labelKey: "nav.settings", icon: Settings, path: "/settings" },
  { labelKey: "nav.help", icon: HelpCircle, path: "/help" },
];

const enterpriseItems: NavItem[] = [
  { labelKey: "nav.admin", icon: LayoutDashboard, path: "/admin" },
  { labelKey: "nav.workspaces", icon: Building2, path: "/enterprise/workspaces" },
  { labelKey: "nav.cases", icon: Scale, path: "/enterprise/cases" },
];

/**
 * The job rail. It lives on the deeper press-bed tone; the active route is a
 * "pulled proof" — a sheet-white tab with a drawn hairline and a registration
 * mark showing where the job currently sits.
 */
export function Sidebar({ isOpen, onClose, collapsed, onCollapse }: { isOpen: boolean; onClose: () => void; collapsed: boolean; onCollapse: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCurrentResult } = useAnalysis();
  const { isAuthenticated, logout, user } = useAuth();
  const { isRTL } = useLanguage();
  const { t } = useTranslation("common");

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // logout failed but still clear client state
    }
    clearCurrentResult();
    navigate("/login", { replace: true });
    onClose();
  };

  const renderItem = (item: NavItem, active: boolean) => {
    const Icon = item.icon;
    const label = t(item.labelKey);
    const link = (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={cn(
          "group flex items-center gap-3 border border-transparent px-3 py-2 text-[13px] font-medium transition-colors duration-150",
          collapsed ? "justify-center px-2" : "",
          active
            ? "nav-link-active"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="truncate">{label}</span>}
        {!collapsed && active && <span className="reg-dot ms-auto h-2.5 w-2.5 text-primary" aria-hidden />}
      </Link>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.path} delayDuration={0}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side={isRTL ? "left" : "right"} className="text-xs">{label}</TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-foreground/40 md:hidden" role="button" tabIndex={0} aria-label="Close navigation" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") onClose(); }} />}

      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col bg-sidebar transition-[width,transform] duration-300 ease-in-out",
          isRTL ? "right-0 border-l border-sidebar-border" : "left-0 border-r border-sidebar-border",
          collapsed ? "w-16" : "w-60",
          isOpen ? "translate-x-0" : isRTL ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand block — the registration lockup */}
        <Link
          to="/"
          className={cn(
            "flex h-14 items-center border-b border-sidebar-border px-3",
            collapsed ? "justify-center px-0" : "gap-2.5",
          )}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-primary-foreground">
            <RegMark className="h-[18px] w-[18px]" />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-none">
              <span className="block truncate font-display text-[15px] font-extrabold uppercase tracking-wide text-sidebar-accent-foreground" style={{ fontStretch: "118%" }}>
                Clone Lens
              </span>
              <span className="press-slug mt-1 block text-[9px] tracking-[0.14em]">{t("platform")}</span>
            </span>
          )}
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3 scrollbar-thin">
          {navItems.map((item) => renderItem(item, isActivePath(location.pathname, item.path)))}

          {/* Enterprise section — admin-only routes, so hide the links from
              non-admins instead of letting them bounce off ProtectedRoute */}
          {user?.is_admin && (
            <div className={cn("mt-4", collapsed ? "px-0" : "")}>
              {!collapsed ? (
                <p className="press-slug mb-1.5 flex items-center gap-2 px-3 text-[9px]">
                  <span className="h-px w-3 bg-sidebar-foreground/50" aria-hidden />
                  {t("nav.enterprise")}
                </p>
              ) : (
                <div className="mx-2 my-1 h-px bg-sidebar-border" />
              )}
              {enterpriseItems.map((item) => renderItem(item, location.pathname.startsWith(item.path)))}
            </div>
          )}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-2">
          {isAuthenticated ? (
            <>
              {!collapsed && (
                <div className="border border-sidebar-border bg-sidebar-accent/50 px-3 py-2">
                  <span className="press-slug block text-[9px]">{t("header.signedInAs")}</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-sidebar-accent-foreground">{user?.username}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleLogout()}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed ? "justify-center px-2" : "",
                )}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{t("header.logout")}</span>}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2 text-[13px] font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed ? "justify-center px-2" : "",
              )}
            >
              <LogIn className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{t("header.signIn")}</span>}
            </Link>
          )}

          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-full text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", collapsed ? "" : "justify-end pr-3")}
            onClick={onCollapse}
            aria-label={t("nav.toggleSidebar", { defaultValue: t("nav.collapse") })}
            title={t("nav.toggleSidebar", { defaultValue: t("nav.collapse") })}
          >
            {collapsed ? (
              isRTL ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <span className={cn("text-xs text-sidebar-foreground", isRTL ? "ml-1" : "mr-1")}>{t("nav.collapse")}</span>
                {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </>
            )}
          </Button>

          {/* The calibration strip — the rail signs off with the ink legend. */}
          {!collapsed && (
            <div className="flex justify-center pb-1 pt-1.5">
              <ControlStrip />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
