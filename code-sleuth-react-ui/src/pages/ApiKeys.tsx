import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  BookOpen,
  Check,
  Copy,
  CreditCard,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Masthead, FieldSheet, Field, Panel, Serial, Figure, SpecList } from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import {
  createApiKey,
  getApiPlans,
  listApiKeys,
  openApiPortal,
  revokeApiKey,
  startApiCheckout,
  type ApiKeyRow,
  type ApiPlanInfo,
  type ApiUsage,
} from "@/lib/adminApi";
import { cn } from "@/lib/utils";

type Tab = "keys" | "usage" | "docs";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://YOUR_HOST";
const HOST = ORIGIN.replace(/^https?:\/\//, "");

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation("apiKeys");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? t("apiKeys.keys.copied", { defaultValue: "Copied" }) : label}
    </button>
  );
}

function CodeBlock({ code, copyLabel }: { code: string; copyLabel: string }) {
  return (
    <div className="code-surface relative my-3 overflow-hidden">
      <div className="absolute end-2 top-2 z-10">
        <CopyButton text={code} label={copyLabel} />
      </div>
      <pre className="overflow-x-auto p-4 pt-9 text-left text-[12.5px] leading-relaxed" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A code specimen framed as a dossier exhibit — a FIG caption + copy, code on the mount. */
function Exhibit({ n, label, code, copyLabel }: { n: number; label: string; code: string; copyLabel: string }) {
  return (
    <Figure n={n} label={label} actions={<CopyButton text={code} label={copyLabel} />}>
      <pre className="overflow-x-auto text-left font-mono text-[12.5px] leading-relaxed text-foreground" dir="ltr">
        <code>{code}</code>
      </pre>
    </Figure>
  );
}

/** A right-aligned statement reading for the usage spec-sheet: ink number, optional caption; amber only as a tint chip. */
function UsageValue({ value, sub, warn = false }: { value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="text-end">
      {warn ? (
        <span className="rounded-sm bg-warning/20 px-1.5 py-0.5 font-mono text-sm font-bold tabular-nums text-foreground">
          {value}
        </span>
      ) : (
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</span>
      )}
      {sub && <span className="mt-1 block text-[11px] font-normal normal-case leading-tight text-muted-foreground">{sub}</span>}
    </div>
  );
}

// ── Keys tab (credentials register) ──────────────────────────────────────────

function KeysTab() {
  const { t } = useTranslation("apiKeys");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState("");
  const activeCount = keys.filter((k) => !k.revoked).length;

  useEffect(() => {
    listApiKeys().then(setKeys).catch(() => undefined);
  }, []);

  const create = async () => {
    if (activeCount >= 20) {
      toast.error(t("apiKeys.keys.limitReached"));
      return;
    }
    setCreating(true);
    try {
      const { token, item } = await createApiKey(name.trim());
      setKeys((prev) => [item, ...prev]);
      setFreshToken(token);
      setName("");
    } catch {
      toast.error(t("apiKeys.keys.generate"));
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (id: number) => {
    try {
      await revokeApiKey(id);
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, revoked: true } : k)));
    } catch {
      toast.error(t("apiKeys.keys.revoke"));
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : t("apiKeys.keys.never"));

  return (
    <div className="space-y-10">
      {/* Issue credential — the interactive form, kept as a bordered card */}
      <FieldSheet>
        <Field label={t("apiKeys.keys.createTitle")}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeys.keys.namePlaceholder")}
              maxLength={120}
              className="flex-1 font-mono"
            />
            <Button onClick={() => void create()} disabled={creating} className="gap-2">
              <Plus className="h-4 w-4" />
              {creating ? t("apiKeys.keys.generating") : t("apiKeys.keys.generate")}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("apiKeys.keys.description")}</p>
          {activeCount >= 20 && (
            <p className="mt-2 text-xs text-foreground">{t("apiKeys.keys.limitReached")}</p>
          )}
        </Field>
      </FieldSheet>

      {/* One-time token reveal — the issued credential, framed as a warning-toned exhibit */}
      {freshToken && (
        <Figure
          label={
            <span className="flex items-center gap-2">
              <TriangleAlert className="h-4 w-4 text-warning" />
              {t("apiKeys.keys.tokenTitle")}
            </span>
          }
          actions={<CopyButton text={freshToken} label={t("apiKeys.keys.copy")} />}
          className="border-warning/50"
        >
          <p className="mb-3 text-sm text-muted-foreground">{t("apiKeys.keys.tokenWarning")}</p>
          <code
            className="block overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
            dir="ltr"
          >
            {freshToken}
          </code>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFreshToken("")}>
            {t("apiKeys.keys.done")}
          </Button>
        </Figure>
      )}

      {/* Register — a ruled ledger §-section, not a card box */}
      <Panel
        bare
        marker="§"
        label={t("apiKeys.keys.heading")}
        actions={
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {activeCount} / 20 {t("apiKeys.keys.active").toLowerCase()}
          </span>
        }
      >
        {keys.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            {t("apiKeys.keys.none")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-foreground">
                  <th className="t-label w-10 px-4 py-2.5 text-start">#</th>
                  <th className="t-label px-4 py-2.5 text-start">{t("apiKeys.keys.prefix")}</th>
                  <th className="t-label px-4 py-2.5 text-start">{t("apiKeys.keys.created")}</th>
                  <th className="t-label px-4 py-2.5 text-start">{t("apiKeys.keys.lastUsed")}</th>
                  <th className="t-label px-4 py-2.5 text-start">{t("apiKeys.usage.statusLabel")}</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr
                    key={k.id}
                    className={cn("border-b border-border/60 last:border-b-0", k.revoked && "opacity-60")}
                  >
                    <td className="px-4 py-3 align-top">
                      <Serial tone={k.revoked ? "muted" : "primary"}>{String(i + 1).padStart(2, "0")}</Serial>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                        <span className="truncate font-medium text-foreground">
                          {k.name || t("apiKeys.keys.unnamed")}
                        </span>
                      </div>
                      <code className="mt-1 block font-mono text-xs text-muted-foreground" dir="ltr">
                        {k.prefix}.••••••••
                      </code>
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {fmt(k.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-muted-foreground" dir="ltr">
                      {fmt(k.lastUsedAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={k.revoked ? "badge-info" : "badge-success"}>
                        {k.revoked ? t("apiKeys.keys.revoked") : t("apiKeys.keys.active")}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top text-end">
                      {!k.revoked && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-destructive hover:text-destructive"
                          onClick={() => void revoke(k.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("apiKeys.keys.revoke")}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Usage tab (usage statement) ──────────────────────────────────────────────

function PlanCard({
  plan,
  index,
  isCurrent,
  busy,
  onSubscribe,
}: {
  plan: ApiPlanInfo;
  index: number;
  isCurrent: boolean;
  busy: string | null;
  onSubscribe: (code: string) => void;
}) {
  const { t } = useTranslation("apiKeys");
  const price = plan.priceCents === 0 ? t("apiKeys.usage.freePrice") : money(plan.priceCents);
  return (
    <div className={cn("flex flex-col gap-3 py-4 sm:flex-row sm:items-center", isCurrent && "bg-primary/5")}>
      <Serial tone={isCurrent ? "primary" : "muted"} className="shrink-0">
        {String(index + 1).padStart(2, "0")}
      </Serial>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="t-h5 text-foreground">{plan.name}</span>
          {isCurrent && <span className="badge-info">{t("apiKeys.usage.current")}</span>}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <span className="font-mono text-foreground">{t("apiKeys.usage.includedPer", { n: plan.monthlyPairsIncluded.toLocaleString() })}</span>
          {" · "}
          {plan.allowsOverage ? t("apiKeys.usage.overageThen", { rate: money(plan.overageCentsPer1000) }) : t("apiKeys.usage.hardCapNote")}
        </div>
      </div>
      <div className="flex items-center gap-4 sm:justify-end">
        <div className="font-mono text-lg font-bold tabular-nums text-foreground">
          {price}
          {plan.priceCents > 0 && <span className="text-xs font-normal text-muted-foreground">{t("apiKeys.usage.perMonth")}</span>}
        </div>
        {!isCurrent && plan.code !== "api_free" && (
          <Button size="sm" className="gap-1.5" disabled={busy === plan.code} onClick={() => onSubscribe(plan.code)}>
            {busy === plan.code && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {t("apiKeys.usage.subscribe")}
          </Button>
        )}
      </div>
    </div>
  );
}

function UsageTab() {
  const { t } = useTranslation("apiKeys");
  const [data, setData] = useState<{ plans: ApiPlanInfo[]; current: ApiUsage; billingEnabled: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getApiPlans().then(setData).catch(() => undefined);
  }, []);

  const subscribe = async (plan: string) => {
    setBusy(plan);
    try {
      const res = await startApiCheckout(plan);
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
        return;
      }
    } catch {
      toast.error(data?.billingEnabled ? t("apiKeys.usage.checkoutFailed") : t("apiKeys.usage.billingUnavailable"));
    } finally {
      setBusy(null);
    }
  };

  const manage = async () => {
    setBusy("portal");
    try {
      const res = await openApiPortal();
      if (res.portalUrl) {
        window.location.href = res.portalUrl;
        return;
      }
    } catch {
      toast.error(t("apiKeys.usage.billingUnavailable"));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("apiKeys.usage.noUsage")}</p>;
  }

  const u = data.current;
  const pct = u.includedPairs > 0 ? Math.min(100, (u.pairs / u.includedPairs) * 100) : 0;
  const rate = money(u.ratePer1000Cents);

  const usageRows: Array<{ label: ReactNode; value: ReactNode }> = [
    { label: t("apiKeys.usage.period"), value: u.period },
    { label: t("apiKeys.usage.plan"), value: u.apiPlanName },
    {
      label: t("apiKeys.usage.calls"),
      value: <UsageValue value={u.calls.toLocaleString()} sub={t("apiKeys.usage.callsDesc")} />,
    },
    {
      label: t("apiKeys.usage.pairs"),
      value: <UsageValue value={u.pairs.toLocaleString()} sub={t("apiKeys.usage.pairsDesc")} />,
    },
    {
      label: t("apiKeys.usage.overage"),
      value: (
        <UsageValue value={u.overagePairs.toLocaleString()} sub={t("apiKeys.usage.overageDesc")} warn={u.overagePairs > 0} />
      ),
    },
    {
      label: t("apiKeys.usage.estCost"),
      value: (
        <UsageValue
          value={money(u.estimatedCostCents)}
          sub={t("apiKeys.usage.estCostDesc", { rate })}
          warn={u.estimatedCostCents > 0}
        />
      ),
    },
  ];

  return (
    <div className="space-y-12">
      {/* Statement — metered readings as a ruled §-section spec-sheet */}
      <Panel bare marker="§" label={t("apiKeys.usage.heading")}>
        <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{t("apiKeys.usage.description")}</p>

        {u.atLimit && (
          <div className="mb-5 flex items-center gap-2 rounded-lg border border-warning/45 bg-warning/10 p-4 text-sm font-medium text-foreground">
            <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
            {t("apiKeys.usage.atLimitWarning")}
          </div>
        )}

        <SpecList rows={usageRows} />
      </Panel>

      {/* Allowance meter — a framed figure */}
      <Figure n={1} label={t("apiKeys.usage.included")}>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("apiKeys.usage.includedDesc")}</span>
          <span className="font-mono tabular-nums text-foreground">
            {u.pairs.toLocaleString()} / {u.includedPairs.toLocaleString()}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-sm bg-muted">
          <div
            className={cn("h-full transition-all", u.overagePairs > 0 || u.atLimit ? "bg-warning" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("apiKeys.usage.remaining", { n: u.remainingIncluded.toLocaleString() })}
        </p>
      </Figure>

      {/* Plans — a ruled §-ledger with case numbers */}
      <Panel
        bare
        marker="§"
        label={t("apiKeys.usage.plansTitle")}
        actions={
          u.apiPlan !== "api_free" ? (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === "portal"} onClick={() => void manage()}>
              {busy === "portal" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t("apiKeys.usage.manage")}
            </Button>
          ) : undefined
        }
      >
        <p className="mb-3 text-xs text-muted-foreground">{t("apiKeys.usage.plansDesc")}</p>
        <div className="divide-y divide-border border-t border-border">
          {data.plans.map((p, i) => (
            <PlanCard key={p.code} plan={p} index={i} isCurrent={p.code === u.apiPlan} busy={busy} onSubscribe={(c) => void subscribe(c)} />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{t("apiKeys.usage.estimateNote")}</p>
      </Panel>
    </div>
  );
}

// ── Docs tab (spec sheet) ────────────────────────────────────────────────────

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel bare marker="§" label={title}>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </Panel>
  );
}

function DocsTab() {
  const { t } = useTranslation("apiKeys");

  const checkExample = `curl -X POST "${ORIGIN}/api/v1/ci/check" \\
  -H "Authorization: Bearer csk_xxxxxxxx.YOUR_SECRET" \\
  -H "Content-Type: application/json" \\
  -d '{
        "threshold": 80,
        "language": "python",
        "pairs": [
          {"label_a":"a.py","label_b":"b.py",
           "code_a":"def f(x):\\n  return x*2\\n",
           "code_b":"def g(y):\\n  return y*2\\n"}
        ]
      }'`;

  const responseExample = `{
  "success": true,
  "verdict": "fail",
  "threshold": 80.0,
  "total_pairs": 1,
  "violations": 1,
  "duration_ms": 842,
  "results": [{
    "label_a": "a.py", "label_b": "b.py",
    "combined_similarity": 91.4,
    "text_similarity": 78.2, "token_similarity": 88.0,
    "graph_similarity": 95.1, "ai_similarity": 84.7,
    "is_violation": true,
    "clone_types_detected": ["exact", "structural", "semantic"]
  }]
}`;

  const ghExample = `- name: Plagiarism gate
  run: |
    HTTP=$(curl -sS -o resp.json -w "%{http_code}" \\
      -X POST "${ORIGIN}/api/v1/ci/check" \\
      -H "Authorization: Bearer \${{ secrets.CODECLONE_API_KEY }}" \\
      -H "Content-Type: application/json" --data @pairs.json)
    cat resp.json
    if [ "$HTTP" = "422" ]; then echo "::error::Similarity exceeded"; exit 1; fi
    if [ "$HTTP" != "200" ]; then echo "::error::API error ($HTTP)"; exit 1; fi`;

  const pyExample = `import requests
r = requests.post("${ORIGIN}/api/v1/ci/check",
    headers={"X-API-Key": "csk_xxxxxxxx.YOUR_SECRET"},
    json={"threshold": 80, "language": "python",
          "pairs": [{"code_a": a, "code_b": b}]}, timeout=60)
print(r.json()["verdict"])
if r.status_code == 422:  # verdict == "fail"
    raise SystemExit("Similarity gate failed")`;

  const copy = t("apiKeys.keys.copy");

  return (
    <div className="space-y-12">
      <p className="text-sm text-muted-foreground">{t("apiKeys.docs.intro")}</p>

      {/* The contract at a glance — a ruled spec sheet */}
      <Panel bare marker="§" label="Interface">
        <SpecList
          rows={[
            { label: "Base URL", value: <Mono>{ORIGIN}/api/v1</Mono> },
            {
              label: "Auth",
              value: (
                <span className="text-sm normal-case">
                  <Mono>Authorization: Bearer</Mono> or <Mono>X-API-Key</Mono>
                </span>
              ),
            },
            { label: "Format", value: <span className="text-sm text-foreground">JSON · UTF-8</span> },
          ]}
        />
      </Panel>

      <DocSection title="Base URL & authentication">
        <p>
          All endpoints live under <Mono>{ORIGIN}/api/v1</Mono>. Authenticate every public-API request with an API
          key in either header:
        </p>
        <CodeBlock code={`Authorization: Bearer csk_xxxxxxxx.YOUR_SECRET
# or
X-API-Key: csk_xxxxxxxx.YOUR_SECRET`} copyLabel={copy} />
        <p>
          Keys are shown once at creation and stored only as a salted SHA-256 hash. Create/revoke them in the{" "}
          <b>Keys</b> tab.
        </p>
      </DocSection>

      <DocSection title="Endpoints">
        <DocTable
          head={["Method", "Path", "Auth", "Purpose"]}
          rows={[
            ["POST", "/api/v1/ci/check", "API key", "Run a similarity check on code pairs"],
            ["GET", "/api/v1/ci/languages", "none", "List supported languages"],
            ["GET", "/api/v1/api-keys", "session", "List your keys"],
            ["POST", "/api/v1/api-keys", "session", "Create a key (token shown once)"],
            ["DELETE", "/api/v1/api-keys/{id}", "session", "Revoke a key"],
          ]}
        />
      </DocSection>

      <DocSection title="POST /ci/check — request">
        <DocTable
          head={["Field", "Type", "Required", "Notes"]}
          rows={[
            ["pairs", "array", "yes", "1–50 pairs"],
            ["pairs[].code_a / code_b", "string", "yes", "Source code, max 512 KB each"],
            ["pairs[].label_a / label_b", "string", "no", "Human labels (e.g. file paths)"],
            ["threshold", "number", "no", "0–100, default 80. ≥ threshold ⇒ violation"],
            ["language", "string", "no", "Default python; see /ci/languages"],
          ]}
        />
        <CodeBlock code={checkExample} copyLabel={copy} />
      </DocSection>

      <DocSection title="POST /ci/check — response">
        <p>
          Per-pair scores are 0–100. <Mono>verdict</Mono> is <Mono>"fail"</Mono> if any pair is a violation. HTTP{" "}
          <Mono>200</Mono> = pass, <Mono>422</Mono> = fail (a policy result — fail your build on it),{" "}
          <Mono>401/403/400/429</Mono> = error.
        </p>
        <CodeBlock code={responseExample} copyLabel={copy} />
        <p className="text-xs">
          <b>clone_types_detected</b> values: exact, near_miss, parameterized, function, non_contiguous, structural,
          reordered, function_reordered, gapped, intertwined, semantic.
        </p>
      </DocSection>

      <DocSection title="Errors & limits">
        <DocTable
          head={["code", "Status", "Cause"]}
          rows={[
            ["authentication_required", "401", "Missing/invalid API key"],
            ["api_quota_exceeded", "402", "API plan allowance exceeded — upgrade"],
            ["insufficient_scope", "403", "Key lacks the ci:check scope"],
            ["invalid_threshold", "400", "threshold not in 0–100"],
            ["unsupported_language", "400", "language not supported"],
            ["too_many_pairs", "400", "More than 50 pairs"],
            ["code_too_large", "400", "A source exceeds 512 KB"],
          ]}
        />
        <p className="mt-2 text-xs">
          Rate limit: <b>60 requests/minute per key</b>. Limits: 50 pairs/request, 512 KB/source, 20 active keys/user.
        </p>
      </DocSection>

      {/* Worked examples — each code specimen mounted as a numbered exhibit */}
      <Panel bare marker="§" label="Examples">
        <div className="space-y-4">
          <Exhibit n={1} label="cURL" code={checkExample} copyLabel={copy} />
          <Exhibit n={2} label="GitHub Actions — fail on violation" code={ghExample} copyLabel={copy} />
          <Exhibit n={3} label="Python" code={pyExample} copyLabel={copy} />
        </div>
      </Panel>
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-foreground" dir="ltr">{children}</code>;
}

function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs" dir="ltr">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b-2 border-foreground px-3 py-2 text-start font-mono text-[11px] font-semibold uppercase tracking-wide text-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-border/60 px-3 py-1.5 align-top text-muted-foreground">
                  {j === 0 ? <code className="font-mono text-foreground">{c}</code> : c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ApiKeys() {
  const { t } = useTranslation("apiKeys");
  const { isRTL } = useLanguage();
  const [tab, setTab] = useState<Tab>("keys");

  const tabs = useMemo(
    () => [
      { id: "keys" as Tab, label: t("apiKeys.tabs.keys"), icon: KeyRound },
      { id: "usage" as Tab, label: t("apiKeys.tabs.usage"), icon: CreditCard },
      { id: "docs" as Tab, label: t("apiKeys.tabs.docs"), icon: BookOpen },
    ],
    [t],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6" dir={isRTL ? "rtl" : "ltr"}>
      <Masthead
        kicker={t("apiKeys.eyebrow")}
        title={t("apiKeys.title")}
        description={t("apiKeys.subtitle")}
        meta={[
          { label: "ENDPOINT", value: <span dir="ltr">{`${HOST}/api/v1`}</span> },
          { label: "VERSION", value: "v1" },
          { label: "AUTH", value: "BEARER · X-API-KEY" },
        ]}
      />

      {/* Ruled section tabs — left-anchored, mono */}
      <div className="flex border-b border-border">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wide transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === "keys" && <KeysTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}
