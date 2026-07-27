import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { ControlStrip, CropMarks } from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

const AUTH_ROUTES = new Set(["/auth", "/login"]);

/**
 * The press bed. Chrome (rail, instrument bar, footer slug) sits on the cool
 * bed ground; page content is laid on a bright proof sheet with crop marks
 * at its corners — every route renders as a sheet pulled for inspection.
 */
export function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isAuthRoute = AUTH_ROUTES.has(location.pathname);
  const { isRTL } = useLanguage();
  const { t } = useTranslation("common");

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-background">
        <div className="mx-auto flex w-full max-w-7xl justify-end gap-2 px-4 pt-4 sm:px-6 lg:px-8">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex min-h-[calc(100vh-56px)] w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        collapsed={isSidebarCollapsed}
        onCollapse={() => setIsSidebarCollapsed((current) => !current)}
      />
      <div
        className={`flex min-w-0 flex-1 flex-col transition-[padding] duration-300 ${
          isRTL ? (isSidebarCollapsed ? "md:pr-16" : "md:pr-60") : isSidebarCollapsed ? "md:pl-16" : "md:pl-60"
        }`}
      >
        <Header toggleSidebar={() => setIsSidebarOpen((current) => !current)} />

        {/* The proof sheet */}
        <main className="flex-1 px-3 pb-4 pt-4 sm:px-5 lg:px-7">
          <div className="relative mx-auto min-h-full w-full max-w-[1480px]">
            <CropMarks inset={-5} className="hidden sm:block" />
            <div className="min-h-[calc(100vh-10.5rem)] border border-border bg-card px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
              {children}
            </div>
          </div>
        </main>

        {/* Footer slug — the sheet's edge annotation */}
        <footer className="flex flex-col items-center gap-2 px-6 pb-5 pt-1 sm:flex-row sm:justify-between">
          <div className="press-slug text-[10px]">{t("footer.fullCopyright")}</div>
          <div className="flex items-center gap-4">
            <nav className="press-slug flex gap-3 text-[10px]">
              <Link to="/terms" className="transition-colors hover:text-foreground">{t("footer.terms", { defaultValue: "Terms" })}</Link>
              <Link to="/privacy" className="transition-colors hover:text-foreground">{t("footer.privacy", { defaultValue: "Privacy" })}</Link>
              <Link to="/status" className="transition-colors hover:text-foreground">{t("footer.status", { defaultValue: "Status" })}</Link>
            </nav>
            <ControlStrip className="hidden sm:inline-flex" />
          </div>
        </footer>
      </div>
    </div>
  );
}
