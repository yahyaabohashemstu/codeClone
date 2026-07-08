import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Activity,
  BookOpen,
  Check,
  Copy,
  CreditCard,
  KeyRound,
  Plus,
  Terminal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/context/LanguageContext";
import {
  createApiKey,
  getApiUsage,
  listApiKeys,
  revokeApiKey,
  type ApiKeyRow,
  type ApiUsage,
} from "@/lib/adminApi";
import { cn } from "@/lib/utils";

type Tab = "keys" | "usage" | "docs";

const ORIGIN = typeof window !== "undefined" ? window.location.origin : "https://YOUR_HOST";

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Shared bits ─────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
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
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? label + "…" : label}
    </button>
  );
}

function CodeBlock({ code, copyLabel }: { code: string; copyLabel: string }) {
  return (
    <div className="relative my-3 overflow-hidden rounded-lg border border-border bg-[#0f172a]">
      <div className="absolute end-2 top-2 z-10">
        <CopyButton text={code} label={copyLabel} />
      </div>
      <pre className="overflow-x-auto p-4 pt-9 text-left text-[12.5px] leading-relaxed text-slate-100" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  accent = "text-foreground",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums", accent)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ── Keys tab ────────────────────────────────────────────────────────────────

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
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-base font-semibold text-foreground">{t("apiKeys.keys.createTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("apiKeys.keys.description")}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("apiKeys.keys.namePlaceholder")}
            maxLength={120}
            className="flex-1"
          />
          <Button onClick={() => void create()} disabled={creating} className="gap-2">
            <Plus className="h-4 w-4" />
            {creating ? t("apiKeys.keys.generating") : t("apiKeys.keys.generate")}
          </Button>
        </div>
        {activeCount >= 20 && (
          <p className="mt-2 text-xs text-amber-600">{t("apiKeys.keys.limitReached")}</p>
        )}
      </div>

      {freshToken && (
        <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
            <TriangleAlert className="h-4 w-4" />
            {t("apiKeys.keys.tokenTitle")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("apiKeys.keys.tokenWarning")}</p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded-md border border-border bg-background px-3 py-2 font-mono text-xs" dir="ltr">
              {freshToken}
            </code>
            <CopyButton text={freshToken} label={t("apiKeys.keys.copy")} />
          </div>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setFreshToken("")}>
            {t("apiKeys.keys.done")}
          </Button>
        </div>
      )}

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">{t("apiKeys.keys.heading")}</h3>
        {keys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-card/50 p-6 text-center text-sm text-muted-foreground">
            {t("apiKeys.keys.none")}
          </p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card p-4",
                  k.revoked && "opacity-60",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="truncate font-medium text-foreground">
                      {k.name || t("apiKeys.keys.unnamed")}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        k.revoked
                          ? "bg-muted text-muted-foreground"
                          : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {k.revoked ? t("apiKeys.keys.revoked") : t("apiKeys.keys.active")}
                    </span>
                  </div>
                  <code className="mt-1 block font-mono text-xs text-muted-foreground" dir="ltr">
                    {k.prefix}.••••••••
                  </code>
                </div>
                <div className="text-xs text-muted-foreground">
                  <div>{t("apiKeys.keys.created")}: {fmt(k.createdAt)}</div>
                  <div>{t("apiKeys.keys.lastUsed")}: {fmt(k.lastUsedAt)}</div>
                </div>
                {!k.revoked && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={() => void revoke(k.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("apiKeys.keys.revoke")}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Usage tab ───────────────────────────────────────────────────────────────

function UsageTab() {
  const { t } = useTranslation("apiKeys");
  const [usage, setUsage] = useState<ApiUsage | null>(null);

  useEffect(() => {
    getApiUsage().then(setUsage).catch(() => undefined);
  }, []);

  if (!usage) {
    return <p className="text-sm text-muted-foreground">{t("apiKeys.usage.noUsage")}</p>;
  }

  const pct = usage.includedPairs > 0 ? Math.min(100, (usage.pairs / usage.includedPairs) * 100) : 0;
  const rate = money(usage.ratePer1000Cents);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">{t("apiKeys.usage.heading")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("apiKeys.usage.description")}</p>
          </div>
          <div className="text-end text-xs text-muted-foreground">
            <div>{t("apiKeys.usage.period")}: <span className="font-mono">{usage.period}</span></div>
            <div>{t("apiKeys.usage.plan")}: <span className="font-semibold text-foreground">{usage.planName}</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Activity} label={t("apiKeys.usage.calls")} value={usage.calls.toLocaleString()} sub={t("apiKeys.usage.callsDesc")} />
        <Stat icon={Terminal} label={t("apiKeys.usage.pairs")} value={usage.pairs.toLocaleString()} sub={t("apiKeys.usage.pairsDesc")} accent="text-primary" />
        <Stat icon={KeyRound} label={t("apiKeys.usage.overage")} value={usage.overagePairs.toLocaleString()} sub={t("apiKeys.usage.overageDesc")} accent={usage.overagePairs > 0 ? "text-amber-600" : "text-foreground"} />
        <Stat icon={CreditCard} label={t("apiKeys.usage.estCost")} value={money(usage.estimatedCostCents)} sub={t("apiKeys.usage.estCostDesc", { rate })} accent={usage.estimatedCostCents > 0 ? "text-amber-600" : "text-emerald-600"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">{t("apiKeys.usage.included")}</span>
          <span className="tabular-nums text-muted-foreground">
            {usage.pairs.toLocaleString()} / {usage.includedPairs.toLocaleString()}
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", usage.overagePairs > 0 ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("apiKeys.usage.remaining", { n: usage.remainingIncluded.toLocaleString() })} · {t("apiKeys.usage.includedDesc")}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-card/50 p-4">
        <p className="text-xs text-muted-foreground">{t("apiKeys.usage.estimateNote")}</p>
        <Button asChild variant="outline" size="sm">
          <Link to="/billing">{t("apiKeys.usage.upgrade")}</Link>
        </Button>
      </div>
    </div>
  );
}

// ── Docs tab ────────────────────────────────────────────────────────────────

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="mb-2 text-sm font-bold text-foreground">{title}</h3>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
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
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("apiKeys.docs.intro")}</p>

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

      <DocSection title="Examples">
        <p className="text-xs font-semibold text-foreground">cURL</p>
        <CodeBlock code={checkExample} copyLabel={copy} />
        <p className="text-xs font-semibold text-foreground">GitHub Actions (fail on violation)</p>
        <CodeBlock code={ghExample} copyLabel={copy} />
        <p className="text-xs font-semibold text-foreground">Python</p>
        <CodeBlock code={pyExample} copyLabel={copy} />
      </DocSection>
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
              <th key={h} className="border-b border-border bg-muted/50 px-3 py-2 text-start font-semibold text-foreground">
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
    <div className="mx-auto max-w-4xl px-4 py-6" dir={isRTL ? "rtl" : "ltr"}>
      <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        {t("apiKeys.eyebrow")}
      </div>
      <h1 className="text-2xl font-bold text-foreground">{t("apiKeys.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("apiKeys.subtitle")}</p>

      <div className="mt-5 flex gap-1 rounded-lg border border-border bg-card p-1">
        {tabs.map((tabItem) => {
          const Icon = tabItem.icon;
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              onClick={() => setTab(tabItem.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === "keys" && <KeysTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}
