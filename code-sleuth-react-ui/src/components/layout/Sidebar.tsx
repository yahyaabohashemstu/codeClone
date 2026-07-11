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

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-background/80 md:hidden" role="button" tabIndex={0} aria-label="Close navigation" onClick={onClose} onKeyDown={(e) => { if (e.key === "Escape" || e.key === "Enter") onClose(); }} />}

      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col bg-sidebar transition-all duration-300 ease-in-out",
          isRTL ? "right-0 border-l border-border/50" : "left-0 border-r border-border/50",
          collapsed ? "w-16" : "w-60",
          isOpen ? "translate-x-0" : isRTL ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary">
            <img src="/brand/logo.png" alt="Clone Lens" className="h-9 w-9 object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block truncate font-mono text-sm font-bold text-sidebar-accent-foreground">Clone Lens</span>
              <span className="block font-mono text-[10px] uppercase tracking-wider text-sidebar-foreground">{t("platform")}</span>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3 scrollbar-thin">
          {navItems.map((item) => {
            const active = isActivePath(location.pathname, item.path);
            const Icon = item.icon;
            const label = t(item.labelKey);
            const link = (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2.5" : "",
                  active
                    ? "bg-primary/12 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
                {!collapsed && <span>{label}</span>}
                {!collapsed && active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}

          {/* Enterprise section — admin-only routes, so hide the links from
              non-admins instead of letting them bounce off ProtectedRoute */}
          {user?.is_admin && (
          <div className={cn("mt-3", collapsed ? "px-0" : "px-1")}>
            {!collapsed && (
              <p className="mb-1 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {t("nav.enterprise")}
              </p>
            )}
            {collapsed && <div className="my-1 h-px bg-sidebar-border" />}
            {enterpriseItems.map((item) => {
              const active = location.pathname.startsWith(item.path);
              const Icon = item.icon;
              const label = t(item.labelKey);
              const link = (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                    collapsed ? "justify-center px-2.5" : "",
                    active
                      ? "bg-primary/12 text-primary"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
                  {!collapsed && <span>{label}</span>}
                  {!collapsed && active && <span className="ms-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path} delayDuration={0}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
                  </Tooltip>
                );
              }

              return link;
            })}
          </div>
          )}
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-2">
          {isAuthenticated ? (
            <>
              {!collapsed && (
                <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground">
                  {t("header.signedInAs")} <span className="font-mono font-semibold text-sidebar-accent-foreground">{user?.username}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => void handleLogout()}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  collapsed ? "justify-center px-2.5" : "",
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
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-all hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed ? "justify-center px-2.5" : "",
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
          >
            {collapsed ? (
              isRTL ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <>
                <span className={cn("text-xs text-sidebar-foreground/60", isRTL ? "ml-1" : "mr-1")}>{t("nav.collapse")}</span>
                {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}
