import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BrandLockup } from "@/components/brand/BrandMark";
import { Kbd, QuotaMeter } from "@/components/bench/Bench";
import { IconSearch } from "@/components/bench/icons";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { getBillingSummary, type BillingSummary } from "@/lib/billingApi";
import { cn } from "@/lib/utils";

function initialsOf(name: string | undefined | null) {
  const n = (name ?? "").trim();
  if (!n) return "??";
  const parts = n.split(/[\s._-]+/).filter(Boolean);
  const two = parts.length >= 2 ? parts[0][0] + parts[1][0] : n.slice(0, 2);
  return two.toUpperCase();
}

/**
 * The instrument bar above the sheet: where you are on the left, the archive
 * search in the middle, and the run's standing — quota, plan, account — on the
 * right. Navigation itself lives on the rail.
 */
export function Header({ toggleSidebar }: { toggleSidebar: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCurrentResult } = useAnalysis();
  const { isAuthenticated, user, logout } = useAuth();
  const { language, toggleLanguage } = useLanguage();
  const { t } = useTranslation("common");
  const [summary, setSummary] = useState<BillingSummary | null>(null);

  // Show the modifier that matches the user's platform, not a hardcoded ⌘.
  const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);
  const shortcutHint = isMac ? "⌘ K" : "Ctrl K";

  const routeTitle = t(`routes.${location.pathname}`, { defaultValue: t("header.workspace") });

  // The quota meter reads the same period counter as the billing page, and
  // re-reads on every route change so a fresh comparison moves the needle.
  useEffect(() => {
    if (!isAuthenticated) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    getBillingSummary()
      .then((s) => {
        if (!cancelled) setSummary(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // logout failed but still clear client state
    }
    clearCurrentResult();
    navigate("/login", { replace: true });
  };

  // The search button advertises Ctrl/⌘+K — register the actual shortcut.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        navigate("/history");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const planLabel = summary?.planName ?? summary?.plan ?? null;

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-bench-hair bg-bench-raised px-4 sm:px-6">
      <button
        type="button"
        onClick={toggleSidebar}
        className="flex h-8 w-8 items-center justify-center text-txt-secondary hover:text-txt-primary md:hidden"
        aria-label="Toggle navigation"
      >
        <Menu className="h-4 w-4" strokeWidth={1.5} />
      </button>

      {/* Mobile brand — the rail is off-canvas there */}
      <Link to="/" className="md:hidden" aria-label="Clone Lens">
        <BrandLockup markClassName="h-[20px]" />
      </Link>

      {/* Where you are */}
      <h1 className="label hidden truncate text-txt-primary md:block">{routeTitle}</h1>

      {/* The archive search */}
      <button
        type="button"
        onClick={() => navigate("/history")}
        className="well ms-auto hidden h-8 w-80 justify-start text-start hover:border-bench-strong lg:flex"
        aria-label={t("header.historySearch")}
        title={t("header.historySearch")}
      >
        <IconSearch className="text-txt-muted" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-txt-muted">{t("header.searchPlaceholder")}</span>
        <Kbd>{shortcutHint}</Kbd>
      </button>

      <div className="ms-auto flex shrink-0 items-center gap-3 sm:gap-4 lg:ms-4">
        {isAuthenticated ? (
          <>
            {summary && (
              <Link
                to="/billing"
                className="hidden items-center gap-2.5 md:flex"
                title={summary.unlimited ? t("topbar.quotaUnlimited") : t("topbar.quotaTitle", { used: summary.used, limit: summary.limit })}
              >
                <span className="label text-txt-muted">{t("topbar.quota")}</span>
                <QuotaMeter used={summary.used} limit={summary.unlimited ? 0 : summary.limit} />
                <span className="mono-meta text-txt-secondary" dir="ltr">
                  {summary.unlimited ? `${summary.used} / ∞` : `${summary.used} / ${summary.limit}`}
                </span>
              </Link>
            )}

            {planLabel && (
              <Link to="/billing" className="label hidden border border-bench-strong px-2 py-[7px] text-txt-primary hover:border-txt-muted sm:inline-flex">
                {planLabel}
              </Link>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center outline-none focus-visible:ring-2 focus-visible:ring-signal"
                  aria-label={t("topbar.account")}
                  aria-haspopup="menu"
                >
                  <span className="label flex h-[30px] w-[30px] items-center justify-center bg-txt-primary text-bench-base" aria-hidden>
                    {initialsOf(user?.username)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="w-56 border-bench-strong bg-bench-raised p-0 text-txt-primary">
                <DropdownMenuLabel className="border-b border-bench-hair px-3 py-3">
                  <span className="label block text-txt-muted">{t("header.signedInAs")}</span>
                  <span className="mt-1.5 block truncate text-sm font-semibold">{user?.username}</span>
                </DropdownMenuLabel>
                <div className="py-1">
                  <DropdownMenuItem asChild className="cursor-pointer px-3 py-2 text-[13px] focus:bg-bench-hair focus:text-txt-primary">
                    <Link to="/billing">{t("nav.billing")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer px-3 py-2 text-[13px] focus:bg-bench-hair focus:text-txt-primary">
                    <Link to="/settings">{t("nav.settings")}</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer px-3 py-2 text-[13px] focus:bg-bench-hair focus:text-txt-primary">
                    <Link to="/help">{t("nav.help")}</Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator className="bg-bench-hair" />
                <div className="py-1">
                  <DropdownMenuItem
                    className="cursor-pointer justify-between px-3 py-2 text-[13px] focus:bg-bench-hair focus:text-txt-primary"
                    onSelect={(e) => {
                      e.preventDefault();
                      toggleLanguage();
                    }}
                  >
                    <span>{t("topbar.language")}</span>
                    <span className="mono-meta text-txt-muted">{language === "en" ? "العربية" : "English"}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer px-3 py-2 text-[13px] focus:bg-bench-hair focus:text-txt-primary" onSelect={() => void handleLogout()}>
                    {t("header.logout")}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <button type="button" onClick={toggleLanguage} className="label text-txt-muted hover:text-txt-primary" aria-label={t("topbar.language")}>
              {language === "en" ? "AR" : "EN"}
            </button>
            <Link to="/login" className="btn btn-primary h-9 px-3.5 text-[13px]">
              {t("header.signIn")}
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
