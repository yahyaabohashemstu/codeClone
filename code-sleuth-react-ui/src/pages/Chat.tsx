import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { Masthead, Panel, FieldSheet, Field, Serial } from "@/components/dossier/Dossier";
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

  // No grounded case on file — an unfiled consultation.
  if (!currentResult) {
    return (
      <div className="animate-fade-in space-y-6">
        <Masthead
          kicker={t("chat.eyebrow", { defaultValue: "Grounded chat" })}
          title={t("chat.pageTitle")}
          description={t("chat.noContextDescription")}
          meta={[
            { label: "MODE", value: t("chat.modeConsult") },
            { label: "STATUS", value: <span className="text-warning">{t("chat.statusNoContext")}</span> },
            { label: "GROUNDING", value: t("chat.groundingNone") },
          ]}
        />

        {/* Unfiled consultation — a bold, left-anchored, tick-framed exhibit. */}
        <div className="tick-frame relative">
          <Panel label={t("chat.noContextTitle")}>
            <p className="max-w-[60ch] t-body">{t("chat.noContextDescription")}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild size="sm" className="h-10 text-sm">
                <Link to="/analysis">{t("buttons.runAnalysis")}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-10 text-sm">
                <Link to="/history">{t("chat.openHistory")}</Link>
              </Button>
            </div>
          </Panel>
        </div>
      </div>
    );
  }

  const { source_labels, saved_analysis_id, language, analysis_structured } = currentResult;
  const contextLabel = `${source_labels.code1} ↔ ${source_labels.code2}`;
  const caseSerial = saved_analysis_id != null ? `#${saved_analysis_id}` : "UNSAVED";
  const risk = analysis_structured?.risk_level;

  return (
    <div className="animate-fade-in space-y-6">
      <Masthead
        kicker={t("chat.eyebrow", { defaultValue: "Grounded chat" })}
        title={t("chat.pageTitle")}
        description={t("chat.pageDescription")}
        meta={[
          { label: "CASE", value: caseSerial },
          { label: "LANG", value: (language || "—").toUpperCase() },
          { label: "MODE", value: t("chat.modeGrounded") },
          ...(risk
            ? [
                {
                  label: "RISK",
                  value: (
                    <span className={risk === "critical" || risk === "high" ? "text-destructive" : risk === "moderate" ? "text-warning" : "text-muted-foreground"}>
                      {risk.toUpperCase()}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      {/* What this consultation is grounded in — the two exhibits on the record */}
      <FieldSheet>
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              <Serial tone="primary">A</Serial>
              {t("chat.exhibitA", { defaultValue: "Source A" })}
            </span>
          }
          align="center"
        >
          <span dir="ltr" className="block truncate font-mono text-sm text-foreground">
            {source_labels.code1}
          </span>
        </Field>
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              <Serial tone="primary">B</Serial>
              {t("chat.exhibitB", { defaultValue: "Source B" })}
            </span>
          }
          align="center"
        >
          <span dir="ltr" className="block truncate font-mono text-sm text-foreground">
            {source_labels.code2}
          </span>
        </Field>
      </FieldSheet>

      <AnalysisChatPanel analysisId={saved_analysis_id} contextLabel={contextLabel} />
    </div>
  );
};

export default Chat;
