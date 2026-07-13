import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

export function Header({ toggleSidebar }: { toggleSidebar: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCurrentResult } = useAnalysis();
  const { isAuthenticated, user, logout } = useAuth();
  const { isRTL } = useLanguage();
  const { t } = useTranslation("common");

  // Show the modifier that matches the user's platform, not a hardcoded ⌘.
  const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.userAgent);
  const shortcutHint = isMac ? "⌘K" : "Ctrl K";

  const routeTitle = t(`routes.${location.pathname}`, { defaultValue: t("header.workspace") });

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // logout failed but still clear client state
    }
    clearCurrentResult();
    navigate("/login", { replace: true });
  };

  // The search button advertises ⌘K — register the actual shortcut
  // (Ctrl+K on Windows/Linux, Cmd+K on macOS) instead of a decorative kbd.
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

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center border-b border-border bg-background">
      <div className="flex flex-1 items-center gap-3 px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden"
          aria-label="Toggle navigation"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-2 md:hidden">
          <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary">
            <img src="/brand/logo.png" alt="Clone Lens" className="h-7 w-7 object-contain" />
          </div>
          <span className="t-h5">Clone Lens</span>
        </div>

        <div className="hidden items-center gap-2 text-sm md:flex">
          <span className="font-medium text-foreground">{routeTitle}</span>
        </div>

        {/* Search — visible on lg+ screens */}
        <button
          type="button"
          onClick={() => navigate("/history")}
          className={cn(
            "relative hidden h-9 w-80 items-center gap-2 rounded-md border border-transparent bg-muted/40 px-3 text-xs transition-colors hover:border-border hover:bg-muted/70 lg:flex",
            isRTL ? "mr-auto" : "ml-auto",
          )}
          aria-label={t("header.historySearch")}
          title={t("header.historySearch")}
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t("header.searchPlaceholder")}</span>
          <kbd
            className={cn(
              "hidden items-center rounded border border-border/60 bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-flex",
              isRTL ? "mr-auto" : "ml-auto",
            )}
          >
            {shortcutHint}
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/help")}
          aria-label={t("header.helpStatus")}
          title={t("header.helpStatus")}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border/60" />
        <LanguageToggle />
        <ThemeToggle />

        {isAuthenticated ? (
          <div className={cn("hidden items-center gap-2 md:flex", isRTL ? "mr-3" : "ml-3")}>
            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-[11px]">
              {/* Avatar */}
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-primary-foreground"
                aria-hidden
              >
                {(user?.username ?? "U").slice(0, 2).toUpperCase()}
              </span>
              <span className="text-muted-foreground">{t("header.signedInAs")}</span>
              <span className="font-mono font-semibold text-foreground">{user?.username}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 border-border/60 text-xs"
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("header.logout")}
            </Button>
          </div>
        ) : (
          <div className={cn("hidden md:block", isRTL ? "mr-2" : "ml-2")}>
            <Link to="/login">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-border/60 text-xs hover:border-primary/40 hover:text-primary"
              >
                {t("header.signIn")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
