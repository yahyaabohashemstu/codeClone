import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

interface Readiness {
  status: string;
  checks: Record<string, unknown>;
}

const LABEL_KEYS: Record<string, string> = {
  database: "status.labels.database",
  billingConfigured: "status.labels.billingConfigured",
  emailProvider: "status.labels.emailProvider",
  sentryConfigured: "status.labels.sentryConfigured",
  rateLimitBackend: "status.labels.rateLimitBackend",
  enterpriseKeyConfigured: "status.labels.enterpriseKeyConfigured",
  selfRegistration: "status.labels.selfRegistration",
  emailVerificationRequired: "status.labels.emailVerificationRequired",
};

const Status = () => {
  const { t } = useTranslation("common");
  const { isRTL } = useLanguage();
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    fetch("/api/v1/health/readiness", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setReachable(false))
      .finally(() => setLoading(false));
  }, []);

  const renderValue = (v: unknown) => {
    if (typeof v === "boolean") {
      return v
        ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> {t("status.ok")}</span>
        : <span className="text-muted-foreground">—</span>;
    }
    return <span className="font-mono text-sm">{String(v)}</span>;
  };

  const healthy = reachable && data?.status === "ok";

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      <div className="flex items-center gap-3">
        {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" />
          : healthy ? <CheckCircle2 className="h-6 w-6 text-success" />
          : <XCircle className="h-6 w-6 text-destructive" />}
        <div>
          <h1 className="t-h2">{t("status.title")}</h1>
          <p className="t-sm">{loading ? t("status.checking") : healthy ? t("status.operational") : t("status.degraded")}</p>
        </div>
      </div>

      {data && (
        <section className="rounded-lg border border-border bg-card">
          <dl className="divide-y divide-border">
            {Object.entries(data.checks).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between px-5 py-3">
                <dt className="text-sm text-foreground">{LABEL_KEYS[key] ? t(LABEL_KEYS[key]) : key}</dt>
                <dd>{renderValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {!reachable && (
        <p className="t-body text-destructive">{t("status.unreachable")}</p>
      )}

      <p>
        <Link to="/" className="text-primary hover:underline">
          {isRTL ? "→" : "←"} {t("status.home")}
        </Link>
      </p>
    </div>
  );
};

export default Status;
