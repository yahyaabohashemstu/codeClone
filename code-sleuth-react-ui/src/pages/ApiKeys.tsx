import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Masthead, Panel, Figure, SpecList } from "@/components/dossier/Dossier";
import { Scale, ScaleNumerals, Tag } from "@/components/bench/Bench";
import { IconFilePlus } from "@/components/bench/icons";
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
      className="inline-flex h-7 items-center gap-1.5 border border-bench-strong px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-txt-secondary transition-colors hover:border-txt-muted hover:text-txt-primary"
    >
      {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.5} />}
      {copied ? t("apiKeys.keys.copied", { defaultValue: "Copied" }) : label}
    </button>
  );
}

/** A code specimen on a plate, with the copy control in the plate's strip. */
function CodeBlock({ code, copyLabel, title }: { code: string; copyLabel: string; title?: string }) {
  return (
    <div className="plate my-3">
      <div className="plate-strip !h-9">
        <span className="mono-meta text-plate-soft" dir="ltr">{title ?? "—"}</span>
        <span className="[&>button]:border-plate-stroke [&>button]:text-plate-soft [&>button:hover]:border-plate-ink [&>button:hover]:text-plate-ink">
          <CopyButton text={code} label={copyLabel} />
        </span>
      </div>
      <pre className="plate-code m-0 overflow-x-auto p-4 scrollbar-thin" dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** A worked example framed as a numbered figure — the code on a plate inside the frame. */
function Exhibit({ n, label, code, copyLabel }: { n: number; label: string; code: string; copyLabel: string }) {
  return (
    <Figure n={n} label={label} actions={<CopyButton text={code} label={copyLabel} />}>
      <pre className="plate-code m-0 overflow-x-auto border border-plate-hair bg-plate-base p-4 scrollbar-thin" dir="ltr">
        <code>{code}</code>
      </pre>
    </Figure>
  );
}

/** A statement reading: mono value, optional caption; a flagged value reads in signal. */
function UsageValue({ value, sub, warn = false }: { value: string; sub?: string; warn?: boolean }) {
  return (
    <span className="flex flex-col items-end gap-1.5 text-end">
      <span className={cn("mono-value", warn ? "text-signal-bench" : "text-txt-primary")} dir="ltr">
        {value}
      </span>
      {sub && <span className="text-[11px] leading-tight text-txt-muted">{sub}</span>}
    </span>
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
    <div className="space-y-5">
      {/* Issue a credential */}
      <Panel label={t("apiKeys.keys.createTitle")}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="well w-full sm:max-w-[360px]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("apiKeys.keys.namePlaceholder")}
              aria-label={t("apiKeys.keys.namePlaceholder")}
              maxLength={120}
              className="font-mono"
              dir="ltr"
            />
          </label>
          <Button onClick={() => void create()} disabled={creating} className="h-9 shrink-0">
            {creating ? t("apiKeys.keys.generating") : t("apiKeys.keys.generate")}
          </Button>
        </div>
        <p className="mt-3 max-w-[64ch] text-[12.5px] leading-relaxed text-txt-muted">{t("apiKeys.keys.description")}</p>
        {activeCount >= 20 && <p className="mt-2 text-[12.5px] text-signal-bench">{t("apiKeys.keys.limitReached")}</p>}
      </Panel>

      {/* One-time reveal — the credential is issued ONCE */}
      {freshToken && (
        <div role="status" className="border border-signal">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bench-hair px-5 py-3">
            <Tag tone="hot">{t("apiKeys.keys.tokenTitle")}</Tag>
            <CopyButton text={freshToken} label={t("apiKeys.keys.copy")} />
          </div>
          <div className="px-5 py-4">
            <p className="max-w-[64ch] text-[13px] leading-relaxed text-txt-primary">{t("apiKeys.keys.tokenWarning")}</p>
            <code className="mono-filename mt-3 block overflow-x-auto border border-bench-strong bg-bench-well px-3 py-3 text-txt-primary scrollbar-thin" dir="ltr">
              {freshToken}
            </code>
            <button type="button" className="link mt-4 text-[13px]" onClick={() => setFreshToken("")}>
              {t("apiKeys.keys.done")}
            </button>
          </div>
        </div>
      )}

      {/* Register */}
      <Panel
        label={t("apiKeys.keys.heading")}
        bodyClassName="p-0"
        actions={
          <span className="mono-meta text-txt-muted" dir="ltr">
            {activeCount} / 20 {t("apiKeys.keys.active").toLowerCase()}
          </span>
        }
      >
        {keys.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
            <IconFilePlus className="text-txt-muted" />
            <p className="text-[15px] text-txt-primary">{t("apiKeys.keys.none")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className="h-9 border-b border-bench-hair">
                  <th className="label w-10 ps-5 text-start font-semibold text-txt-muted">#</th>
                  <th className="label ps-3 text-start font-semibold text-txt-muted">{t("apiKeys.keys.prefix")}</th>
                  <th className="label w-[170px] ps-3 text-start font-semibold text-txt-muted">{t("apiKeys.keys.created")}</th>
                  <th className="label w-[170px] ps-3 text-start font-semibold text-txt-muted">{t("apiKeys.keys.lastUsed")}</th>
                  <th className="label w-28 ps-3 text-start font-semibold text-txt-muted">{t("apiKeys.usage.statusLabel")}</th>
                  <th className="w-28 pe-5">
                    <span className="sr-only">{t("apiKeys.keys.revoke")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr key={k.id} className={cn("h-[46px] border-b border-bench-hair last:border-b-0", k.revoked && "opacity-60")}>
                    <td className="ps-5 align-middle">
                      <span className="mono-ordinal text-txt-muted">{String(i + 1).padStart(2, "0")}</span>
                    </td>
                    <td className="ps-3 py-2 align-middle">
                      <span className="block truncate text-[13px] font-semibold text-txt-primary">{k.name || t("apiKeys.keys.unnamed")}</span>
                      <code className="mono-filename mt-1 block text-txt-muted" dir="ltr">
                        {k.prefix}.••••••••
                      </code>
                    </td>
                    <td className="mono-filename ps-3 align-middle text-txt-secondary" dir="ltr">
                      {fmt(k.createdAt)}
                    </td>
                    <td className="mono-filename ps-3 align-middle text-txt-secondary" dir="ltr">
                      {fmt(k.lastUsedAt)}
                    </td>
                    <td className="ps-3 align-middle">
                      <Tag tone={k.revoked ? "neutral" : "advisory"}>{k.revoked ? t("apiKeys.keys.revoked") : t("apiKeys.keys.active")}</Tag>
                    </td>
                    <td className="pe-5 align-middle text-end">
                      {!k.revoked && (
                        <Button variant="destructive" size="sm" className="h-8" onClick={() => void revoke(k.id)}>
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

// ── Usage tab ───────────────────────────────────────────────────────────────

function PlanRow({
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
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-5">
      <span className="mono-ordinal w-8 shrink-0 text-txt-muted">{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="t-h5 text-txt-primary">{plan.name}</span>
          {isCurrent && <Tag tone="hot">{t("apiKeys.usage.current")}</Tag>}
        </div>
        <div className="mt-1.5 text-[12.5px] text-txt-muted">
          <span className="mono-meta text-txt-secondary">{t("apiKeys.usage.includedPer", { n: plan.monthlyPairsIncluded.toLocaleString() })}</span>
          {" · "}
          {plan.allowsOverage ? t("apiKeys.usage.overageThen", { rate: money(plan.overageCentsPer1000) }) : t("apiKeys.usage.hardCapNote")}
        </div>
      </div>
      <div className="flex items-center gap-5 sm:justify-end">
        <span className="flex items-baseline gap-1" dir="ltr">
          <span className="mono-value text-txt-primary">{price}</span>
          {plan.priceCents > 0 && <span className="mono-meta text-txt-muted">{t("apiKeys.usage.perMonth")}</span>}
        </span>
        {!isCurrent && plan.code !== "api_free" && (
          <Button size="sm" disabled={busy === plan.code} onClick={() => onSubscribe(plan.code)}>
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
    return <p className="text-[13px] text-txt-muted">{t("apiKeys.usage.noUsage")}</p>;
  }

  const u = data.current;
  const pct = u.includedPairs > 0 ? Math.min(100, (u.pairs / u.includedPairs) * 100) : 0;
  const rate = money(u.ratePer1000Cents);
  const flagged = u.overagePairs > 0 || u.atLimit;

  const usageRows: Array<{ label: ReactNode; value: ReactNode }> = [
    { label: t("apiKeys.usage.period"), value: <span dir="ltr">{u.period}</span> },
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
    <div className="space-y-5">
      {/* Statement */}
      <Panel label={t("apiKeys.usage.heading")}>
        <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-txt-secondary">{t("apiKeys.usage.description")}</p>

        {u.atLimit && (
          <div role="alert" className="mb-5 flex items-start gap-3 border border-signal px-4 py-3">
            <span aria-hidden className="lamp is-on mt-0.5" />
            <span className="text-[13px] leading-relaxed text-txt-primary">{t("apiKeys.usage.atLimitWarning")}</span>
          </div>
        )}

        <SpecList rows={usageRows} className="border-t border-bench-hair" />
      </Panel>

      {/* Allowance scale */}
      <Panel
        label={t("apiKeys.usage.included")}
        actions={
          <span className="mono-value text-txt-primary" dir="ltr">
            {u.pairs.toLocaleString()} / {u.includedPairs.toLocaleString()}
          </span>
        }
      >
        <Scale value={pct} quiet={!flagged} label={`${Math.round(pct)}%`} />
        <ScaleNumerals className="mt-2" />
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-txt-muted">
          <span>{t("apiKeys.usage.includedDesc")}</span>
          <span className="mono-meta">{t("apiKeys.usage.remaining", { n: u.remainingIncluded.toLocaleString() })}</span>
        </p>
      </Panel>

      {/* Plans */}
      <Panel
        label={t("apiKeys.usage.plansTitle")}
        actions={
          u.apiPlan !== "api_free" ? (
            <Button variant="outline" size="sm" disabled={busy === "portal"} onClick={() => void manage()}>
              {t("apiKeys.usage.manage")}
            </Button>
          ) : undefined
        }
      >
        <p className="mb-3 text-[12.5px] text-txt-muted">{t("apiKeys.usage.plansDesc")}</p>
        <div className="divide-y divide-bench-hair border-y border-bench-hair">
          {data.plans.map((p, i) => (
            <PlanRow key={p.code} plan={p} index={i} isCurrent={p.code === u.apiPlan} busy={busy} onSubscribe={(c) => void subscribe(c)} />
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-txt-muted">{t("apiKeys.usage.estimateNote")}</p>
      </Panel>
    </div>
  );
}

// ── Docs tab ────────────────────────────────────────────────────────────────

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel label={title}>
      <div className="space-y-2 text-[13px] leading-relaxed text-txt-secondary">{children}</div>
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
    <div className="space-y-5">
      <p className="body-lg max-w-[64ch] text-txt-secondary">{t("apiKeys.docs.intro")}</p>

      {/* The contract at a glance */}
      <Panel label="Interface">
        <SpecList
          rows={[
            { label: "Base URL", value: <Mono>{ORIGIN}/api/v1</Mono> },
            {
              label: "Auth",
              value: (
                <span className="text-[13px] text-txt-primary">
                  <Mono>Authorization: Bearer</Mono> or <Mono>X-API-Key</Mono>
                </span>
              ),
            },
            { label: "Format", value: <span dir="ltr">JSON · UTF-8</span> },
          ]}
        />
      </Panel>

      <DocSection title="Base URL & authentication">
        <p>
          All endpoints live under <Mono>{ORIGIN}/api/v1</Mono>. Authenticate every public-API request with an API
          key in either header:
        </p>
        <CodeBlock
          title="headers"
          code={`Authorization: Bearer csk_xxxxxxxx.YOUR_SECRET
# or
X-API-Key: csk_xxxxxxxx.YOUR_SECRET`}
          copyLabel={copy}
        />
        <p>
          Keys are shown once at creation and stored only as a salted SHA-256 hash. Create/revoke them in the{" "}
          <b className="font-semibold text-txt-primary">Keys</b> tab.
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
        <CodeBlock title="request.sh" code={checkExample} copyLabel={copy} />
      </DocSection>

      <DocSection title="POST /ci/check — response">
        <p>
          Per-pair scores are 0–100. <Mono>verdict</Mono> is <Mono>"fail"</Mono> if any pair is a violation. HTTP{" "}
          <Mono>200</Mono> = pass, <Mono>422</Mono> = fail (a policy result — fail your build on it),{" "}
          <Mono>401/403/400/429</Mono> = error.
        </p>
        <CodeBlock title="response.json" code={responseExample} copyLabel={copy} />
        <p className="text-[12.5px]">
          <b className="font-semibold text-txt-primary">clone_types_detected</b> values: exact, near_miss, parameterized, function, non_contiguous, structural,
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
        <p className="mt-2 text-[12.5px]">
          Rate limit: <b className="font-semibold text-txt-primary">60 requests/minute per key</b>. Limits: 50 pairs/request, 512 KB/source, 20 active keys/user.
        </p>
      </DocSection>

      {/* Worked examples — each specimen mounted as a numbered figure */}
      <Panel label="Examples">
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
  return (
    <code className="mono-filename border border-bench-strong bg-bench-well px-1.5 py-0.5 text-txt-primary" dir="ltr">
      {children}
    </code>
  );
}

function DocTable({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse border-y border-bench-hair" dir="ltr">
        <thead>
          <tr className="h-9 border-b border-bench-hair">
            {head.map((h) => (
              <th key={h} className="label px-3 text-left font-semibold text-txt-muted first:ps-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-bench-hair last:border-b-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2.5 align-top text-[12.5px] text-txt-secondary first:ps-0">
                  {j === 0 ? <code className="mono-filename text-txt-primary">{c}</code> : c}
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
      { id: "keys" as Tab, label: t("apiKeys.tabs.keys") },
      { id: "usage" as Tab, label: t("apiKeys.tabs.usage") },
      { id: "docs" as Tab, label: t("apiKeys.tabs.docs") },
    ],
    [t],
  );

  return (
    <div className="mx-auto max-w-4xl pt-7" dir={isRTL ? "rtl" : "ltr"}>
      <Masthead
        kicker={t("topbar.api", { ns: "common" })}
        title={t("apiKeys.title")}
        description={t("apiKeys.subtitle")}
        meta={[
          { label: "ENDPOINT", value: <span dir="ltr">{`${HOST}/api/v1`}</span> },
          { label: "VERSION", value: "v1" },
          { label: "AUTH", value: "BEARER · X-API-KEY" },
        ]}
      />

      {/* Section switch */}
      <div className="segment-group" role="tablist">
        {tabs.map((tabItem) => {
          const active = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(tabItem.id)}
              className={cn("segment focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-signal", active && "is-on")}
            >
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div className="mt-8">
        {tab === "keys" && <KeysTab />}
        {tab === "usage" && <UsageTab />}
        {tab === "docs" && <DocsTab />}
      </div>
    </div>
  );
}
