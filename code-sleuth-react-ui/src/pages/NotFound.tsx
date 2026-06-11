import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const { t } = useTranslation("common");

  return (
    <div className="flex min-h-[72vh] items-center justify-center p-6">
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-10 text-center"
        style={{ boxShadow: "var(--card-shadow-rest)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 h-56 w-96 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(ellipse, hsl(var(--primary) / 0.28), transparent 70%)" }}
        />

        <div className="relative flex flex-col items-center gap-5">
          {/* Gradient icon circle */}
          <div
            className="flex h-20 w-20 items-center justify-center rounded-full text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            <Compass className="h-9 w-9" />
          </div>

          <div
            className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold text-primary"
            style={{ background: "hsl(var(--primary) / 0.08)", border: "1px solid hsl(var(--primary) / 0.18)" }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-mono">{t("notFound.title")}</span>
          </div>

          <h1 className="h-2">{t("notFound.heading")}</h1>
          <p className="max-w-md t-body">{t("notFound.description")}</p>

          <Button
            asChild
            size="lg"
            className="mt-2 h-11 gap-2 px-6 text-white"
            style={{ background: "var(--gradient-brand)", boxShadow: "var(--glow-shadow-sm)" }}
          >
            <Link to="/">
              {t("notFound.backHome")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
