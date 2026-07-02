import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { useLanguage } from "@/context/LanguageContext";

interface MainLayoutProps {
  children: React.ReactNode;
}

const AUTH_ROUTES = new Set(["/auth", "/login"]);

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
        <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
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
        className={`flex flex-1 flex-col transition-all duration-300 ${
          isRTL ? (isSidebarCollapsed ? "md:pr-16" : "md:pr-60") : isSidebarCollapsed ? "md:pl-16" : "md:pl-60"
        }`}
      >
        <Header toggleSidebar={() => setIsSidebarOpen((current) => !current)} />
        <main className="mx-auto flex-1 w-full max-w-[1480px] px-4 py-6 md:px-6 lg:px-8">{children}</main>
        <footer className="border-t border-border/30 px-6 py-4 text-center text-xs text-muted-foreground/50">
          <div>{t("footer.fullCopyright")}</div>
          <div className="mt-1 flex justify-center gap-3">
            <Link to="/terms" className="hover:text-foreground">{t("footer.terms", { defaultValue: "Terms" })}</Link>
            <span aria-hidden>·</span>
            <Link to="/privacy" className="hover:text-foreground">{t("footer.privacy", { defaultValue: "Privacy" })}</Link>
            <span aria-hidden>·</span>
            <Link to="/status" className="hover:text-foreground">{t("footer.status", { defaultValue: "Status" })}</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
