import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitize";

export function AnalysisReport({ html }: { html: string }) {
  const { t } = useTranslation("results");

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h3 className="t-h5 flex items-center gap-2 text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          {t("results.analysisReport.title")}
        </h3>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t("results.analysisReport.description")}
        </p>
      </div>
      <div className="analysis-markdown px-6 py-5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html || t("results.analysisReport.empty")) }} />
    </div>
  );
}
