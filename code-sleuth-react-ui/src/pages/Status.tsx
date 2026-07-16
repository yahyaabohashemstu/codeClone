import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Ledger,
  LedgerCell,
  LedgerHead,
  LedgerRow,
  LedgerSkeleton,
  Masthead,
  Notice,
  StatusTag,
} from "@/components/dossier/Dossier";

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

  // Each check reads as a STATE stamp — colour encodes the reading, never decoration.
  const renderState = (v: unknown) => {
    if (typeof v === "boolean") {
      return v ? (
        <StatusTag tone="ok">{t("status.ok")}</StatusTag>
      ) : (
        <span className="font-mono text-xs text-muted-foreground">—</span>
      );
    }
    return (
      <span className="font-mono text-xs tabular-nums text-foreground" dir="ltr">
        {String(v)}
      </span>
    );
  };

  const healthy = reachable && data?.status === "ok";
  const verdictLabel = loading
    ? t("status.checking")
    : healthy
      ? t("status.operational")
      : t("status.degraded");

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-4">
      {/* Case header — the probed endpoint as the mono kicker, the overall reading as a stamp */}
      <Masthead
        kicker={
          <span className="font-mono normal-case tracking-normal" dir="ltr">
            /api/v1/health/readiness
          </span>
        }
        title={t("status.title")}
        actions={
          <StatusTag tone={loading ? "muted" : healthy ? "ok" : "danger"}>{verdictLabel}</StatusTag>
        }
      />

      {loading && (
        <Ledger columns="1fr auto">
          <LedgerHead cells={["Subsystem", "State"]} aligns={["start", "end"]} />
          <LedgerSkeleton rows={6} />
        </Ledger>
      )}

      {/* Backend unreachable — a left-anchored fault notice, not a lone red line */}
      {!loading && !reachable && (
        <Notice tone="danger" label={t("status.degraded")}>
          {t("status.unreachable")}
        </Notice>
      )}

      {!loading && reachable && data && (
        <Ledger columns="1fr auto">
          <LedgerHead cells={["Subsystem", "State"]} aligns={["start", "end"]} />
          {Object.entries(data.checks).map(([key, value]) => (
            <LedgerRow key={key}>
              <LedgerCell className="text-sm text-foreground">
                {LABEL_KEYS[key] ? t(LABEL_KEYS[key]) : key}
              </LedgerCell>
              <LedgerCell align="end">{renderState(value)}</LedgerCell>
            </LedgerRow>
          ))}
        </Ledger>
      )}

      <div className="pt-1">
        <Link
          to="/"
          className="font-mono text-xs font-semibold uppercase tracking-wider text-primary hover:underline"
        >
          {t("status.home")}
        </Link>
      </div>
    </div>
  );
};

export default Status;
