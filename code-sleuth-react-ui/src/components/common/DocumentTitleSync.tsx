import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAnalysis } from "@/context/AnalysisContext";

export function DocumentTitleSync() {
  const location = useLocation();
  const { t } = useTranslation("common");
  const { currentResult } = useAnalysis();

  useEffect(() => {
    // Handle dynamic enterprise routes like /enterprise/workspaces/123
    const basePath = location.pathname.replace(/\/\d+$/, "");
    const routeTitle =
      t(`routes.${location.pathname}`, { defaultValue: "" }) ||
      t(`routes.${basePath}`, { defaultValue: "" }) ||
      t("routes.notFound");

    if ((location.pathname === "/results" || location.pathname === "/chat") && currentResult) {
      document.title = `${routeTitle} • ${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2} • CodeSimilar`;
      return;
    }

    document.title = `${routeTitle} • CodeSimilar`;
  }, [location.pathname, t, currentResult]);

  return null;
}
