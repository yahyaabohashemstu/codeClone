import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  Code2,
  GitCompare,
  HelpCircle,
  History,
  Home,
  LogIn,
  LogOut,
  MessageSquare,
  LineChart,
  Scale,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

function isActivePath(currentPath: string, itemPath: string) {
  return currentPath === itemPath;
}

export function Sidebar({ isOpen, onClose, collapsed, onCollapse }: { isOpen: boolean; onClose: () => void; collapsed: boolean; onCollapse: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCurrentResult } = useAnalysis();
  const { isAuthenticated, logout, user } = useAuth();
  const { language, isRTL } = useLanguage();

  const copy =
    language === "ar"
      ? {
          navItems: [
            { label: "الرئيسية", icon: Home, path: "/" },
            { label: "التحليل", icon: GitCompare, path: "/analysis" },
            { label: "النتائج", icon: BarChart3, path: "/results" },
            { label: "السجل", icon: History, path: "/history" },
            { label: "التحليلات", icon: LineChart, path: "/analytics" },
            { label: "الدردشة", icon: MessageSquare, path: "/chat" },
            { label: "المساعدة", icon: HelpCircle, path: "/help" },
          ],
          enterpriseItems: [
            { label: "مساحات العمل", icon: Building2, path: "/enterprise/workspaces" },
            { label: "قضايا المراجعة", icon: Scale, path: "/enterprise/cases" },
          ],
          enterpriseLabel: "المؤسسة",
          platform: "منصة التحليل",
          signedInAs: "تم تسجيل الدخول باسم",
          logout: "تسجيل الخروج",
          signIn: "تسجيل الدخول",
          collapse: "طي الشريط",
        }
      : {
          navItems: [
            { label: "Home", icon: Home, path: "/" },
            { label: "Analysis", icon: GitCompare, path: "/analysis" },
            { label: "Results", icon: BarChart3, path: "/results" },
            { label: "History", icon: History, path: "/history" },
            { label: "Analytics", icon: LineChart, path: "/analytics" },
            { label: "Chat", icon: MessageSquare, path: "/chat" },
            { label: "Help", icon: HelpCircle, path: "/help" },
          ],
          enterpriseItems: [
            { label: "Workspaces", icon: Building2, path: "/enterprise/workspaces" },
            { label: "Review Cases", icon: Scale, path: "/enterprise/cases" },
          ],
          enterpriseLabel: "Enterprise",
          platform: "Analysis Platform",
          signedInAs: "Signed in as",
          logout: "Logout",
          signIn: "Sign In",
          collapse: "Collapse",
        };

  const handleLogout = async () => {
    clearCurrentResult();
    await logout();
    navigate("/login", { replace: true });
    onClose();
  };

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden" onClick={onClose} />}

      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col bg-sidebar transition-all duration-300 ease-in-out",
          isRTL ? "right-0 border-l border-border/50" : "left-0 border-r border-border/50",
          collapsed ? "w-16" : "w-60",
          isOpen ? "translate-x-0" : isRTL ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-sidebar-border px-4", collapsed ? "justify-center" : "gap-3")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-sm">
            <Code2 className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block truncate text-sm font-bold text-sidebar-accent-foreground">CodeSimilar</span>
              <span className="block text-[10px] text-sidebar-foreground">{copy.platform}</span>
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3 scrollbar-thin">
          {copy.navItems.map((item) => {
            const active = isActivePath(location.pathname, item.path);
            const Icon = item.icon;
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
                style={
                  active && !collapsed
                    ? isRTL
                      ? { borderRight: "2px solid hsl(var(--primary))", paddingRight: "10px" }
                      : { borderLeft: "2px solid hsl(var(--primary))", paddingLeft: "10px" }
                    : undefined
                }
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
              </Link>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.path} delayDuration={0}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
                </Tooltip>
              );
            }

            return link;
          })}

          {/* Enterprise section */}
          <div className={cn("mt-3", collapsed ? "px-0" : "px-1")}>
            {!collapsed && (
              <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {copy.enterpriseLabel}
              </p>
            )}
            {collapsed && <div className="my-1 h-px bg-sidebar-border" />}
            {copy.enterpriseItems.map((item) => {
              const active = location.pathname.startsWith(item.path);
              const Icon = item.icon;
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
                  style={
                    active && !collapsed
                      ? isRTL
                        ? { borderRight: "2px solid hsl(var(--primary))", paddingRight: "10px" }
                        : { borderLeft: "2px solid hsl(var(--primary))", paddingLeft: "10px" }
                      : undefined
                  }
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "")} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                </Link>
              );

              if (collapsed) {
                return (
                  <Tooltip key={item.path} delayDuration={0}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
                  </Tooltip>
                );
              }

              return link;
            })}
          </div>
        </nav>

        <div className="space-y-2 border-t border-sidebar-border p-2">
          {isAuthenticated ? (
            <>
              {!collapsed && (
                <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 text-xs text-sidebar-foreground">
                  {copy.signedInAs} <span className="font-semibold text-sidebar-accent-foreground">{user?.username}</span>
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
                {!collapsed && <span>{copy.logout}</span>}
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
              {!collapsed && <span>{copy.signIn}</span>}
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
                <span className={cn("text-xs text-sidebar-foreground/60", isRTL ? "ml-1" : "mr-1")}>{copy.collapse}</span>
                {isRTL ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
              </>
            )}
          </Button>
        </div>
      </aside>
    </>
  );
}
