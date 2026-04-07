import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";

const Chat = () => {
  const { currentResult, loadCurrent } = useAnalysis();
  const { language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const copy =
    language === "ar"
      ? {
          loading: "جارٍ تحميل أحدث سياق للتحليل...",
          noContextTitle: "لا يوجد سياق تحليل نشط",
          noContextDescription: "شغّل تحليلًا أو أعد فتح تحليل سابق أولًا حتى تبني الدردشة الذكية إجاباتها على بيانات المقارنة الحقيقية.",
          runAnalysis: "تشغيل التحليل",
          openHistory: "فتح السجل",
          pageTitle: "دردشة التحليل الذكية",
          pageDescription: "اطرح أسئلة متابعة مبنية على نتيجة التحليل الحالية واحصل على إجابات واعية بالسياق.",
        }
      : {
          loading: "Loading the latest analysis context…",
          noContextTitle: "No active analysis context",
          noContextDescription: "Run or reopen an analysis first so the AI chat can ground its answers in real comparison data.",
          runAnalysis: "Run Analysis",
          openHistory: "Open History",
          pageTitle: "AI Analysis Chat",
          pageDescription: "Ask grounded follow-up questions about the current analysis result and receive context-aware answers.",
        };

  useEffect(() => {
    if (currentResult) return;
    setIsLoading(true);
    void loadCurrent().finally(() => setIsLoading(false));
  }, [currentResult, loadCurrent]);

  if (isLoading && !currentResult) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="card-premium flex items-center gap-3 px-5 py-4 text-sm text-muted-foreground">
          <span className="h-3.5 w-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          {copy.loading}
        </div>
      </div>
    );
  }

  if (!currentResult) {
    return (
      <div className="card-premium mx-auto max-w-2xl p-10 text-center">
        <MessageSquare className="mx-auto mb-4 h-12 w-12 text-muted-foreground/30" />
        <h2 className="text-2xl font-bold text-foreground">{copy.noContextTitle}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {copy.noContextDescription}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button asChild>
            <Link to="/analysis">{copy.runAnalysis}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/history">{copy.openHistory}</Link>
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
          {copy.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy.pageDescription}
        </p>
      </div>
      <AnalysisChatPanel contextLabel={`${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2}`} />
    </div>
  );
};

export default Chat;
