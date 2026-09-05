import { useTranslation } from "react-i18next";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * The analyst note: the engine's generated narrative, typeset in the body
 * voice. The label names the model only when the result carries one — the
 * payload does not, so it reads "Analyst note" alone. A caveat closes it.
 * `hideLabel` is for callers that already title the section themselves.
 */
export function AnalysisReport({
  html,
  id,
  className,
  hideLabel = false,
}: {
  html: string;
  id?: string;
  className?: string;
  hideLabel?: boolean;
}) {
  const { t } = useTranslation("results");
  const trimmed = (html ?? "").trim();

  return (
    <section id={id} className={className} aria-labelledby={id && !hideLabel ? `${id}-label` : undefined}>
      {!hideLabel && (
        <h2 id={id ? `${id}-label` : undefined} className="label pb-4 text-txt-muted">
          {t("results.note.label")}
        </h2>
      )}
      {trimmed ? (
        <div className="analysis-markdown" dangerouslySetInnerHTML={{ __html: sanitizeHtml(trimmed) }} />
      ) : (
        <p className="body-lg text-txt-secondary">{t("results.note.empty")}</p>
      )}
      <p className="pt-3.5 text-[12.5px] leading-normal text-txt-muted">{t("results.note.caveat")}</p>
    </section>
  );
}
