import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";

function buildRouteTitle(pathname: string, language: "en" | "ar") {
  const titles =
    language === "ar"
      ? {
          "/": "الرئيسية",
          "/analysis": "تحليل جديد",
          "/results": "نتائج التحليل",
          "/history": "سجل التحليلات",
          "/chat": "دردشة الذكاء الاصطناعي",
          "/help": "المساعدة والدعم",
          "/auth": "تسجيل الدخول",
          "/login": "تسجيل الدخول",
        }
      : {
          "/": "Home",
          "/analysis": "New Analysis",
          "/results": "Analysis Results",
          "/history": "Analysis History",
          "/chat": "AI Analysis Chat",
          "/help": "Help & Support",
          "/auth": "Sign In",
          "/login": "Sign In",
        };

  return titles[pathname as keyof typeof titles] || (language === "ar" ? "الصفحة غير موجودة" : "Page Not Found");
}

export function DocumentTitleSync() {
  const location = useLocation();
  const { language } = useLanguage();
  const { currentResult } = useAnalysis();

  useEffect(() => {
    const baseTitle = buildRouteTitle(location.pathname, language);

    if ((location.pathname === "/results" || location.pathname === "/chat") && currentResult) {
      document.title = `${baseTitle} • ${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2} • CodeSimilar`;
      return;
    }

    document.title = `${baseTitle} • CodeSimilar`;
  }, [location.pathname, language, currentResult]);

  return null;
}
