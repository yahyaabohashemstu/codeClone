import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { Masthead, Panel, StatusTag, DocFrame, RailReadings } from "@/components/dossier/Dossier";
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
            { label: "STATUS", value: <span className="rounded bg-warning/15 px-1.5 py-0.5 text-foreground">{t("chat.statusNoContext")}</span> },
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
  const groundingAttached = saved_analysis_id != null;
  const risk = analysis_structured?.risk_level;
  const riskTone: "danger" | "warning" | "default" =
    risk === "critical" || risk === "high"
      ? "danger"
      : risk === "moderate"
        ? "warning"
        : "default";

  return (
    <div className="animate-fade-in space-y-6">
      <Masthead
        kicker={t("chat.eyebrow", { defaultValue: "Grounded chat" })}
        title={t("chat.pageTitle")}
        description={t("chat.pageDescription")}
      />

      {/* Instrument-document body — the grounding record sits in the margin rail;
          the grounded consultation transcript is the document body. */}
      <DocFrame
        rail={
          /* What this chat is grounded in — the record, read as margin readings.
             Grounding state leads the block as one row rather than a separate
             hand-rolled caption: AnalysisChatPanel already shows its own indicator,
             so a third simultaneous display of the same state was noise. */
          <RailReadings
            label={t("chat.groundedOn", { defaultValue: "Grounded on" })}
            items={[
              {
                label: t("chat.groundingLabel", { defaultValue: "Grounding" }),
                value: groundingAttached ? (
                  <StatusTag tone="ok">{t("chat.modeGrounded")}</StatusTag>
                ) : (
                  <StatusTag tone="warn">{t("chat.statusNoContext")}</StatusTag>
                ),
              },
              {
                label: t("chat.exhibitA", { defaultValue: "Source A" }),
                value: (
                  <span dir="ltr" title={source_labels.code1} className="block max-w-[8rem] truncate">
                    {source_labels.code1}
                  </span>
                ),
              },
              {
                label: t("chat.exhibitB", { defaultValue: "Source B" }),
                value: (
                  <span dir="ltr" title={source_labels.code2} className="block max-w-[8rem] truncate">
                    {source_labels.code2}
                  </span>
                ),
              },
              { label: "CASE", value: caseSerial },
              { label: "LANG", value: (language || "—").toUpperCase() },
              ...(risk ? [{ label: "RISK", value: risk.toUpperCase(), tone: riskTone }] : []),
            ]}
          />
        }
      >
        <AnalysisChatPanel analysisId={saved_analysis_id} contextLabel={contextLabel} />
      </DocFrame>
    </div>
  );
};

export default Chat;
