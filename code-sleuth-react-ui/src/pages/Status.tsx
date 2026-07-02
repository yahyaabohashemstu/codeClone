import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

interface Readiness {
  status: string;
  checks: Record<string, unknown>;
}

const LABELS: Record<string, string> = {
  database: "Database",
  billingConfigured: "Billing (Stripe)",
  emailProvider: "Email delivery",
  sentryConfigured: "Error tracking",
  rateLimitBackend: "Rate limiting",
  enterpriseKeyConfigured: "Enterprise encryption",
  selfRegistration: "Self-registration",
  emailVerificationRequired: "Email verification",
};

const Status = () => {
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
        ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> OK</span>
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
          <h1 className="t-h2">System status</h1>
          <p className="t-sm">{loading ? "Checking…" : healthy ? "All systems operational" : "Degraded — some checks are failing"}</p>
        </div>
      </div>

      {data && (
        <section className="rounded-2xl border border-border bg-card p-6" style={{ boxShadow: "var(--card-shadow-rest)" }}>
          <dl className="divide-y divide-border/60">
            {Object.entries(data.checks).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between py-2.5">
                <dt className="text-sm text-foreground">{LABELS[key] || key}</dt>
                <dd>{renderValue(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {!reachable && (
        <p className="t-body text-destructive">The service could not be reached.</p>
      )}

      <p><Link to="/" className="text-primary hover:underline">← Home</Link></p>
    </div>
  );
};

export default Status;
