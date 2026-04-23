import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
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
      <div className="card-premium mx-auto max-w-2xl p-10 text-center">
        <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-2xl font-bold text-foreground">{t("chat.noContextTitle")}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("chat.noContextDescription")}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/analysis">{t("buttons.runAnalysis")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/history">{t("chat.openHistory")}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <MessageSquare className="h-6 w-6 text-primary" />
          {t("chat.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("chat.pageDescription")}
        </p>
      </div>
      <AnalysisChatPanel contextLabel={`${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2}`} />
    </div>
  );
};

export default Chat;
