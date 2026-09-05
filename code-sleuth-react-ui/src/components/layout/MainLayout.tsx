import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { useLanguage } from "@/context/LanguageContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

/** Routes that draw their own full-screen shell (the access plate on the bench). */
const AUTH_ROUTES = new Set(["/auth", "/login", "/verify-email", "/reset-password"]);

/**
 * The bench. The rail carries navigation, the instrument bar carries place and
 * standing, and every route lays its content directly on the bench beneath —
 * ruled and framed by its own sections, not by a surrounding sheet.
 */
export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { isRTL } = useLanguage();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isAuthRoute = AUTH_ROUTES.has(location.pathname);

  if (isAuthRoute) {
    return <div className="min-h-screen bg-bench-base text-txt-primary">{children}</div>;
  }

  return (
    <div className="flex min-h-screen bg-bench-base text-txt-primary">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        collapsed={isSidebarCollapsed}
        onCollapse={() => setIsSidebarCollapsed((current) => !current)}
      />

      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${
          isRTL
            ? isSidebarCollapsed
              ? "md:pr-16"
              : "md:pr-60"
            : isSidebarCollapsed
              ? "md:pl-16"
              : "md:pl-60"
        }`}
      >
        <Header toggleSidebar={() => setIsSidebarOpen((current) => !current)} />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 pb-10 sm:px-6 lg:px-8">{children}</div>
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] flex-col gap-3 px-4 pb-6 pt-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span className="mono-meta text-txt-faint">{t("footer.fullCopyright")}</span>
          <nav className="flex items-center gap-4">
            <Link to="/terms" className="text-[12.5px] text-txt-muted underline underline-offset-2 hover:text-txt-primary">
              {t("footer.terms", { defaultValue: "Terms" })}
            </Link>
            <Link to="/privacy" className="text-[12.5px] text-txt-muted underline underline-offset-2 hover:text-txt-primary">
              {t("footer.privacy", { defaultValue: "Privacy" })}
            </Link>
            <Link to="/status" className="text-[12.5px] text-txt-muted underline underline-offset-2 hover:text-txt-primary">
              {t("footer.status", { defaultValue: "Status" })}
            </Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
