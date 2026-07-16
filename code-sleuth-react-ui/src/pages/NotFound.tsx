import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[72vh] items-center justify-center p-4 sm:p-6">
      {/* ── EXHIBIT NOT FOUND — an ink-&-ember case-file cover struck over
             engineering graph paper, the way a missing exhibit reads in a dossier. ── */}
      <section className="ink-panel relative w-full max-w-3xl overflow-hidden rounded-lg border border-border">
        <div className="paper-grid pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
        {/* the un-numbered exhibit — a big struck-out case glyph watermark */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 select-none font-mono text-[9rem] font-bold leading-none tracking-tighter text-foreground/[0.05] end-2 sm:text-[13rem] sm:end-6"
        >
          №—
        </span>

        <div className="relative flex flex-col gap-7 px-6 py-12 sm:px-12 sm:py-16">
          {/* docket header line — case label + a struck disposition stamp */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <div className="t-label flex items-center gap-2.5 text-foreground">
              <span className="h-px w-6 bg-primary" />
              <span>{t("notFound.caseLabel")}</span>
            </div>
            <span className="stamp">{t("notFound.status")}</span>
          </div>

          {/* the error code, at full case-file scale */}
          <div className="t-hero leading-none text-foreground">{t("notFound.title")}</div>

          <div>
            <h1 className="t-h2 text-foreground">{t("notFound.exhibit")}</h1>
            <p className="mt-2 max-w-[52ch] leading-relaxed text-muted-foreground">
              {t("notFound.description")}
            </p>
          </div>

          {/* left-anchored disposition — return to the case index */}
          <div>
            <Button asChild size="lg" className="h-12 px-7">
              <Link to="/">{t("notFound.backHome")}</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default NotFound;
