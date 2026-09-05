import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lamp, PageHeader, Tag } from "@/components/bench/Bench";
import { Panel } from "@/components/dossier/Dossier";

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

/** Readiness board: one lamp per check, lit when the check reads OK. */
const Status = () => {
  const { t } = useTranslation("common");
  const [data, setData] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    fetch("/api/v1/health/readiness", { headers: { Accept: "application/json" } })
      .then((r) => r.json())
      .then((d: Partial<Readiness> | null) => {
        // A gateway error page or a non-readiness JSON body is "unreachable",
        // not a board with zero checks.
        if (!d || typeof d !== "object" || typeof d.status !== "string") {
          setReachable(false);
          return;
        }
        setData({ status: d.status, checks: d.checks && typeof d.checks === "object" ? d.checks : {} });
      })
      .catch(() => setReachable(false))
      .finally(() => setLoading(false));
  }, []);

  const healthy = reachable && data?.status === "ok";
  const overall = loading ? t("status.checking") : healthy ? t("status.operational") : t("status.degraded");

  const lampFor = (v: unknown): { on: boolean; value: string } => {
    if (typeof v === "boolean") return { on: v, value: v ? t("status.ok") : "—" };
    if (v == null || v === "") return { on: false, value: "—" };
    return { on: true, value: String(v) };
  };

  return (
    <div className="mx-auto max-w-2xl pt-7">
      <PageHeader
        kicker={t("footer.status")}
        title={t("status.title")}
        actions={
          loading ? undefined : (
            <Tag tone={healthy ? "neutral" : "hot"}>{healthy ? t("status.ok") : t("status.error")}</Tag>
          )
        }
      />

      <section className="mt-8">
        <Lamp on={!loading && healthy} label={overall} value={loading ? "…" : data?.status ? String(data.status).toUpperCase() : "—"} />
      </section>

      {data && (
        <Panel className="mt-5" label={t("status.checks", { defaultValue: "Checks" })}>
          <div className="[&>*:first-child]:border-t-0">
            {Object.entries(data.checks).map(([key, value]) => {
              const lamp = lampFor(value);
              return (
                <Lamp
                  key={key}
                  on={lamp.on}
                  label={LABEL_KEYS[key] ? t(LABEL_KEYS[key]) : key}
                  value={<span dir="ltr">{lamp.value}</span>}
                />
              );
            })}
          </div>
        </Panel>
      )}

      {!reachable && (
        <p role="alert" className="mt-6 border border-signal px-4 py-3 text-[13px] text-signal-bench">
          {t("status.unreachable")}
        </p>
      )}

      <p className="mt-8">
        <Link to="/" className="link text-[13px]">
          {t("status.home")}
        </Link>
      </p>
    </div>
  );
};

export default Status;
