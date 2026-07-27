import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { RegMark } from "@/components/dossier/Dossier";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

/** The instrument bar: route slug on the left, controls on the right, all on the press bed. */
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
    <header className="sticky top-0 z-50 flex h-14 items-center border-b border-border bg-background">
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

        {/* Mobile brand — the registration lockup */}
        <Link to="/" className="flex items-center gap-2 md:hidden">
          <span className="flex h-7 w-7 items-center justify-center bg-primary text-primary-foreground">
            <RegMark className="h-4 w-4" />
          </span>
          <span className="font-display text-sm font-extrabold uppercase tracking-wide" style={{ fontStretch: "118%" }}>
            Clone Lens
          </span>
        </Link>

        {/* Route slug — where on the job you are */}
        <div className="hidden items-center gap-2.5 md:flex">
          <span className="reg-dot h-2.5 w-2.5 text-muted-foreground" aria-hidden />
          <span className="press-slug text-foreground">{routeTitle}</span>
        </div>

        {/* Search — visible on lg+ screens */}
        <button
          type="button"
          onClick={() => navigate("/history")}
          className={cn(
            "relative hidden h-8 w-80 items-center gap-2 border border-border bg-card px-3 text-xs transition-colors hover:border-foreground/40 lg:flex",
            isRTL ? "mr-auto" : "ml-auto",
          )}
          aria-label={t("header.historySearch")}
          title={t("header.historySearch")}
        >
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{t("header.searchPlaceholder")}</span>
          <kbd
            className={cn(
              "hidden items-center border border-border bg-muted px-1.5 py-0.5 font-display text-[10px] font-semibold text-muted-foreground md:inline-flex",
              isRTL ? "mr-auto" : "ml-auto",
            )}
          >
            {shortcutHint}
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1 px-4">
        <LanguageToggle />
        <ThemeToggle />

        {isAuthenticated ? (
          <div className={cn("hidden items-center gap-2 md:flex", isRTL ? "mr-3" : "ml-3")}>
            <div className="flex items-center gap-2 border border-border bg-card px-2.5 py-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center bg-foreground font-display text-[10px] font-extrabold text-background"
                style={{ fontStretch: "112%" }}
                aria-hidden
              >
                {(user?.username ?? "U").slice(0, 2).toUpperCase()}
              </span>
              <span className="press-slug text-foreground">{user?.username}</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void handleLogout()}
            >
              <LogOut className="h-3.5 w-3.5" />
              {t("header.logout")}
            </Button>
          </div>
        ) : (
          <div className={cn("hidden md:block", isRTL ? "mr-2" : "ml-2")}>
            <Link to="/login">
              <Button size="sm" className="h-8 text-xs">
                {t("header.signIn")}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
