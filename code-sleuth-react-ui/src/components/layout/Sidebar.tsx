import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CreditCard,
  GitCompare,
  HelpCircle,
  History,
  Home,
  KeyRound,
  LineChart,
  LogIn,
  LogOut,
  MessageSquare,
  Scale,
  Settings,
  LayoutDashboard,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScaleTicks } from "@/components/bench/Bench";
import { IconChevronLeft, IconChevronRight } from "@/components/bench/icons";
import { BrandLockup, BrandMark } from "@/components/brand/BrandMark";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

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
 * The instrument rail. It carries every route the workspace has; the active
 * one is marked the way the design marks an active mode — a 2px signal bar on
 * the leading edge with the label in the primary ink, never a coloured wash.
 *
 * Collapsing is a DESKTOP affordance, so it is expressed with `md:` classes
 * throughout: the off-canvas drawer on a phone always opens at full width with
 * every label legible, whatever the collapsed preference happens to be.
 */
export function Sidebar({
  isOpen,
  onClose,
  collapsed,
  onCollapse,
}: {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
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

  /** Row shared by nav links and the account actions at the foot of the rail. */
  const rowClass = cn("relative flex h-9 items-center gap-3 ps-3 pe-2.5 transition-colors", collapsed && "md:justify-center md:px-0");
  const labelClass = cn("ui-nav truncate", collapsed && "md:hidden");

  const renderItem = (item: NavItem, active: boolean) => {
    const Icon = item.icon;
    const label = t(item.labelKey);
    const link = (
      <Link
        key={item.path}
        to={item.path}
        onClick={onClose}
        aria-current={active ? "page" : undefined}
        className={cn(rowClass, active ? "text-txt-primary" : "text-txt-secondary hover:text-txt-primary")}
      >
        {/* The active mark: the design's 2px signal rule, stood on its edge. */}
        <span aria-hidden className={cn("absolute inset-y-0 start-0 w-0.5", active ? "bg-signal" : "bg-transparent")} />
        <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
        <span className={cn(labelClass, active && "font-semibold")}>{label}</span>
      </Link>
    );

    // The tooltip only has work to do once the rail is icons-only.
    if (collapsed) {
      return (
        <Tooltip key={item.path} delayDuration={0}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side={isRTL ? "left" : "right"} className="border-bench-strong bg-bench-raised text-[13px] text-txt-primary">
            {label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          role="button"
          tabIndex={0}
          aria-label="Close navigation"
          onClick={onClose}
          onKeyDown={(e) => {
            if (e.key === "Escape" || e.key === "Enter") onClose();
          }}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 z-40 flex flex-col bg-bench-raised transition-[width,transform] duration-300 ease-in-out",
          isRTL ? "right-0 border-s border-bench-hair" : "left-0 border-e border-bench-hair",
          collapsed ? "w-60 md:w-16" : "w-60",
          isOpen ? "translate-x-0" : isRTL ? "translate-x-full md:translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        {/* Brand block */}
        <Link
          to="/"
          onClick={onClose}
          className={cn("flex h-14 shrink-0 items-center border-b border-bench-hair px-4", collapsed && "md:justify-center md:px-0")}
          aria-label="Clone Lens"
        >
          <span className={cn(collapsed && "md:hidden")}>
            <BrandLockup markClassName="h-[22px]" />
          </span>
          {collapsed && <BrandMark className="hidden h-[22px] md:block" />}
        </Link>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto py-3 scrollbar-thin" aria-label={t("nav.home")}>
          {navItems.map((item) => renderItem(item, location.pathname === item.path))}

          {/* Enterprise section — admin-only routes, hidden from everyone else
              rather than bouncing them off ProtectedRoute. */}
          {user?.is_admin && (
            <div className="mt-5">
              <p className={cn("label flex items-center gap-2 px-3 pb-2 text-txt-muted", collapsed && "md:hidden")}>
                <span aria-hidden className="h-px w-3 bg-bench-strong" />
                {t("nav.enterprise")}
              </p>
              {collapsed && <div aria-hidden className="mx-3 my-2 hidden h-px bg-bench-hair md:block" />}
              {enterpriseItems.map((item) => renderItem(item, location.pathname.startsWith(item.path)))}
            </div>
          )}
        </nav>

        <div className="shrink-0 border-t border-bench-hair">
          {isAuthenticated ? (
            <>
              <div className={cn("px-3 py-3", collapsed && "md:hidden")}>
                <span className="label block text-txt-muted">{t("header.signedInAs")}</span>
                <span className="mt-1.5 block truncate text-[13px] font-semibold text-txt-primary">{user?.username}</span>
              </div>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className={cn(rowClass, "w-full text-txt-secondary hover:text-txt-primary")}
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className={labelClass}>{t("header.logout")}</span>
              </button>
            </>
          ) : (
            <Link to="/login" onClick={onClose} className={cn(rowClass, "text-txt-secondary hover:text-txt-primary")}>
              <LogIn className="h-4 w-4 shrink-0" strokeWidth={1.5} />
              <span className={labelClass}>{t("header.signIn")}</span>
            </Link>
          )}

          {/* The collapse control is desktop-only; on a phone the drawer closes instead. */}
          <button
            type="button"
            onClick={onCollapse}
            className={cn(
              "hidden h-9 w-full items-center gap-2 border-t border-bench-hair text-txt-muted transition-colors hover:text-txt-primary md:flex",
              collapsed ? "justify-center" : "justify-end pe-3",
            )}
            aria-label={collapsed ? t("nav.expand") : t("nav.collapse")}
            title={collapsed ? t("nav.expand") : t("nav.collapse")}
          >
            {!collapsed && <span className="label">{t("nav.collapse")}</span>}
            {collapsed ? isRTL ? <IconChevronLeft /> : <IconChevronRight /> : isRTL ? <IconChevronRight /> : <IconChevronLeft />}
          </button>

          {/* The rail signs off with the calibration strip. */}
          <div className={cn("px-3 pb-3 pt-2.5", collapsed && "md:hidden")}>
            <span aria-hidden className="scale block h-[10px] w-full [&_.scale-tick-major]:h-[10px] [&_.scale-tick]:h-[5px]">
              <ScaleTicks ticks={21} />
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
