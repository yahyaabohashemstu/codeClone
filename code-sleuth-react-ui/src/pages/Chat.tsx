import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { Masthead, Panel, FieldSheet, Field, Serial, SectionHead, SpecList } from "@/components/dossier/Dossier";
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
          kicker={t("chat.eyebrow", { defaultValue: "Grounded consultation" })}
          title={t("chat.pageTitle")}
          description={t("chat.noContextDescription")}
          meta={[
            { label: "MODE", value: "CONSULT" },
            { label: "STATUS", value: <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 text-foreground">NO CONTEXT</span> },
            { label: "GROUNDING", value: "NONE" },
          ]}
        />

        {/* Unfiled consultation — an actionable panel, kept as a card. */}
        <FieldSheet>
          <Field label={t("chat.noContextTitle")}>
            <p className="t-body">{t("chat.noContextDescription")}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="sm" className="h-10 text-sm">
                <Link to="/analysis">{t("buttons.runAnalysis")}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-10 text-sm">
                <Link to="/history">{t("chat.openHistory")}</Link>
              </Button>
            </div>
          </Field>
        </FieldSheet>
      </div>
    );
  }

  const { source_labels, saved_analysis_id, language, analysis_structured } = currentResult;
  const contextLabel = `${source_labels.code1} ↔ ${source_labels.code2}`;
  const caseSerial = saved_analysis_id != null ? `#${saved_analysis_id}` : "UNSAVED";
  const risk = analysis_structured?.risk_level;
  const groundingAttached = saved_analysis_id != null;

  return (
    <div className="animate-fade-in">
      <Masthead
        kicker={t("chat.eyebrow", { defaultValue: "Grounded consultation" })}
        title={t("chat.pageTitle")}
        description={t("chat.pageDescription")}
        meta={[
          { label: "CASE", value: caseSerial },
          { label: "LANG", value: (language || "—").toUpperCase() },
          { label: "MODE", value: "GROUNDED" },
          ...(risk
            ? [
                {
                  label: "RISK",
                  value: (
                    <span className={risk === "critical" || risk === "high" ? "text-destructive" : risk === "moderate" ? "text-foreground" : "text-muted-foreground"}>
                      {risk.toUpperCase()}
                    </span>
                  ),
                },
              ]
            : []),
        ]}
      />

      {/* GROUNDING ON FILE — the record this consultation is annotated against.
          A ruled §-section (not a card): the two exhibits on the record, then a
          spec sheet of the consultation parameters. */}
      <Panel
        bare
        marker="§"
        label={t("chat.groundingTitle", { defaultValue: "Grounding on file" })}
        className="mt-10"
      >
        <Field
          label={
            <span className="inline-flex items-center gap-2">
              <Serial tone="primary">A</Serial>
              {t("chat.exhibitA", { defaultValue: "Exhibit A" })}
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
              {t("chat.exhibitB", { defaultValue: "Exhibit B" })}
            </span>
          }
          align="center"
        >
          <span dir="ltr" className="block truncate font-mono text-sm text-foreground">
            {source_labels.code2}
          </span>
        </Field>

        {/* Consultation parameters — the reading strip for this grounded session. */}
        <div className="mt-6 border-t border-border pt-2">
          <SpecList
            rows={[
              { label: t("chat.specCase", { defaultValue: "Case reference" }), value: caseSerial },
              { label: t("chat.specLanguage", { defaultValue: "Language" }), value: (language || "—").toUpperCase() },
              {
                label: t("chat.specGrounding", { defaultValue: "Grounding" }),
                value: (
                  <span className="inline-flex items-center gap-2">
                    <span className={groundingAttached ? "h-1.5 w-1.5 rounded-full bg-primary" : "h-1.5 w-1.5 rounded-full bg-muted-foreground/50"} />
                    {groundingAttached
                      ? t("chat.groundingAttached", { defaultValue: "Attached" })
                      : t("chat.groundingUnsaved", { defaultValue: "Unsaved" })}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </Panel>

      {/* CONSULTATION TRANSCRIPT — ruled section break; the message flow + composer
          live inside the panel card below. */}
      <div className="mt-12">
        <SectionHead
          marker="§"
          title={t("chat.transcriptTitle", { defaultValue: "Consultation transcript" })}
          aside={`Nº ${caseSerial}`}
        />
        <AnalysisChatPanel analysisId={saved_analysis_id} contextLabel={contextLabel} />
      </div>
    </div>
  );
};

export default Chat;
