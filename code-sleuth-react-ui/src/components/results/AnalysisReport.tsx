import { FileText } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

export function AnalysisReport({ html }: { html: string }) {
  const { language } = useLanguage();
  const copy =
    language === "ar"
      ? {
          title: "تقرير التحليل بين الشيفرتين",
          description: "شرح مولّد بالذكاء الاصطناعي للتشابه والبنية والقابلية للصيانة والمخاطر.",
          empty: "<p>لا يوجد تقرير ذكاء اصطناعي متاح لهذا التحليل.</p>",
        }
      : {
          title: "Inter-Code Analysis Report",
          description: "AI-generated explanation of similarity, structure, maintainability, and risks.",
          empty: "<p>No AI report is available for this analysis.</p>",
        };

  return (
    <div className="card-premium overflow-hidden">
      <div className="border-b border-border/50 px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-primary" />
          {copy.title}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {copy.description}
        </p>
      </div>
      <div className="analysis-markdown px-6 py-5" dangerouslySetInnerHTML={{ __html: html || copy.empty }} />
    </div>
  );
}
