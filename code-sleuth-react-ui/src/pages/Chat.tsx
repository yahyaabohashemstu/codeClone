import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { useAnalysis } from "@/context/AnalysisContext";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@/components/common/PageLoader";

const Chat = () => {
  const { currentResult, loadCurrent } = useAnalysis();
  const { t } = useTranslation("common");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentResult) return;
    setIsLoading(true);
    void loadCurrent().finally(() => setIsLoading(false));
  }, [currentResult, loadCurrent]);

  if (isLoading && !currentResult) {
    return <PageLoader message={t("chat.loading")} />;
  }

  if (!currentResult) {
    return (
      <div
        className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-10 text-center"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))" }}
        >
          <MessageSquare className="h-8 w-8" />
        </div>
        <h2 className="h-3">{t("chat.noContextTitle")}</h2>
        <p className="mx-auto mt-3 max-w-md t-body">{t("chat.noContextDescription")}</p>
        <div className="mt-6 flex justify-center gap-3">
          <Button
            asChild
            className="h-10 gap-2 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            <Link to="/analysis">{t("buttons.runAnalysis")}</Link>
          </Button>
          <Button asChild variant="outline" className="h-10">
            <Link to="/history">{t("chat.openHistory")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
            style={{ background: "var(--gradient-brand)" }}
          >
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h1 className="h-3">{t("chat.pageTitle")}</h1>
            <p className="mt-0.5 t-xs">
              {currentResult.source_labels.code1} ↔ {currentResult.source_labels.code2}
            </p>
          </div>
        </div>
      </div>

      <AnalysisChatPanel
        contextLabel={`${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2}`}
      />
    </div>
  );
};

export default Chat;
