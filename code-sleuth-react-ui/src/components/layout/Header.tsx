import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, Code2, LogOut, Menu, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { LanguageToggle } from "@/components/common/LanguageToggle";
import { useAnalysis } from "@/context/AnalysisContext";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

export function Header({ toggleSidebar }: { toggleSidebar: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { clearCurrentResult } = useAnalysis();
  const { isAuthenticated, user, logout } = useAuth();
  const { language, isRTL } = useLanguage();

  const copy =
    language === "ar"
      ? {
          routes: {
            "/": "الرئيسية",
            "/analysis": "تحليل جديد",
            "/results": "النتائج",
            "/history": "السجل",
            "/chat": "دردشة الذكاء الاصطناعي",
            "/help": "المساعدة",
            "/auth": "المصادقة",
            "/login": "المصادقة",
          } as Record<string, string>,
          workspace: "مساحة العمل",
          historySearch: "افتح سجل التحليلات",
          helpStatus: "افتح المساعدة والحالة",
          signedInAs: "تم تسجيل الدخول باسم",
          logout: "تسجيل الخروج",
          signIn: "تسجيل الدخول",
        }
      : {
          routes: {
            "/": "Dashboard",
            "/analysis": "New Analysis",
            "/results": "Results",
            "/history": "History",
            "/chat": "AI Chat",
            "/help": "Help",
            "/auth": "Authentication",
            "/login": "Authentication",
          } as Record<string, string>,
          workspace: "Workspace",
          historySearch: "Search analysis history",
          helpStatus: "Open help and status",
          signedInAs: "Signed in as",
          logout: "Logout",
          signIn: "Sign In",
        };

  const handleLogout = async () => {
    clearCurrentResult();
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center border-b border-border/50 bg-background/90 backdrop-blur-xl">
      <div className="flex flex-1 items-center gap-3 px-4">
        <Button variant="ghost" size="icon" onClick={toggleSidebar} className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 md:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-brand">
            <Code2 className="h-3.5 w-3.5 text-white" />
          </div>
          <span className="text-sm font-bold">CodeSimilar</span>
        </div>
        <div className="hidden items-center gap-2 text-sm text-muted-foreground md:flex">
          <span className="font-medium text-foreground">{copy.routes[location.pathname] ?? copy.workspace}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="hidden h-8 w-8 text-muted-foreground hover:text-foreground md:flex"
          onClick={() => navigate("/history")}
          aria-label={copy.historySearch}
          title={copy.historySearch}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => navigate("/help")}
          aria-label={copy.helpStatus}
          title={copy.helpStatus}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <div className="mx-1 h-5 w-px bg-border/60" />
        <LanguageToggle />
        <ThemeToggle />

        {isAuthenticated ? (
          <div className={`hidden items-center gap-2 md:flex ${isRTL ? "mr-3" : "ml-3"}`}>
            <div className="rounded-full border border-border/60 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground">
              {copy.signedInAs} <span className="font-semibold text-foreground">{user?.username}</span>
            </div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5 border-border/60 text-xs" onClick={() => void handleLogout()}>
              <LogOut className="h-3.5 w-3.5" />
              {copy.logout}
            </Button>
          </div>
        ) : (
          <div className={`hidden md:block ${isRTL ? "mr-2" : "ml-2"}`}>
            <Link to="/login">
              <Button size="sm" variant="outline" className="h-8 border-border/60 text-xs hover:border-primary/40 hover:text-primary">
                {copy.signIn}
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
