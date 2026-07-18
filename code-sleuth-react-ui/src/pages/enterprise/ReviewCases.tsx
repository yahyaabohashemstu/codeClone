import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Masthead,
  Register,
  Serial,
  StatusTag,
  Tag,
  ScoreMeter,
  Verdict,
  Ledger,
  LedgerHead,
  LedgerRow,
  LedgerCell,
  LedgerFooter,
  LedgerEmpty,
  LedgerFault,
  LedgerSkeleton,
  DocFrame,
  RailReadings,
  DocSection,
} from "@/components/dossier/Dossier";
import { useLanguage } from "@/context/LanguageContext";
import { listWorkspaces, listCases } from "@/lib/enterpriseApi";
import type { EnterpriseCase, CaseStatus, EnterpriseWorkspace } from "@/types/enterprise";
import { cn } from "@/lib/utils";

// Triage cue in the case gutter (colour = meaning). high vs medium never rely on
// opacity alone: high is a filled amber dot, medium a hollow amber ring — a shape
// difference. The dot itself is decorative; the severity is carried in text by the
// visible token rendered beneath it in the same cell.
const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-destructive",
  high: "bg-warning",
  medium: "border-2 border-warning bg-transparent",
  low: "bg-muted-foreground/50",
};

// Case status → semantic tone. One source, consumed by the Register dots and the
// StatusTag stamp so the colour of a status never drifts between the two.
const STATUS_TONE = {
  open: "primary",
  in_review: "warning",
  confirmed_clone: "danger",
  false_positive: "muted",
  dismissed: "muted",
  resolved: "success",
} as const;

const TONE_DOT: Record<string, string> = {
  primary: "bg-primary",
  warning: "bg-warning",
  danger: "bg-destructive",
  success: "bg-success",
  muted: "bg-muted-foreground/50",
};

const ALL_STATUSES: Array<CaseStatus | "all"> = [
  "all", "open", "in_review", "confirmed_clone", "false_positive", "dismissed", "resolved",
];

// One grid-template drives the ledger head + every row (prevents column drift):
// #  ·  artifacts  ·  similarity  ·  verdict  ·  type  ·  status  ·  workspace  ·  ref
//
// Budgeted for the main column this page actually gets: the page caps at max-w-6xl
// (1152px) less p-6, less the DocFrame rail (12rem) and its 2.5rem gap. Every fixed
// track is sized to its real content — Serial + severity token, meter + 3-char
// readout, one StatusTag each, a truncated workspace name, one chevron — and the
// artifacts column is the elastic one (minmax(0,1fr)), so it absorbs whatever is
// left and the row can never demand more width than the column has.
const LEDGER_COLS = "4rem minmax(0,1fr) 6.25rem 6.5rem 5rem 6.25rem 4.75rem 1.75rem";

export default function ReviewCases() {
  const { isRTL } = useLanguage();
  const { t } = useTranslation("enterprise");

  const [workspaces, setWorkspaces] = useState<EnterpriseWorkspace[]>([]);
  const [selectedWs, setSelectedWs] = useState<string>("all");
  const [cases, setCases] = useState<EnterpriseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Load workspaces first, then cases
  useEffect(() => {
    listWorkspaces()
      .then(setWorkspaces)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const wsIds =
      selectedWs === "all"
        ? workspaces.map((w) => w.id)
        : [Number(selectedWs)];

    if (wsIds.length === 0) {
      setCases([]);
      setLoading(false);
      return;
    }

    const statusArg = statusFilter === "all" ? undefined : statusFilter;

    Promise.all(wsIds.map((id) => listCases(id, statusArg)))
      .then((results) => setCases(results.flat()))
      .catch((e) => {
        setError(e?.message ?? t("enterprise.cases.errorMsg"));
        toast.error(t("enterprise.cases.errorMsg"), { description: e?.message });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWs, statusFilter, workspaces, t, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  const filtered = cases.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const pathA = c.match?.artifactA?.logicalPath?.toLowerCase() ?? "";
    const pathB = c.match?.artifactB?.logicalPath?.toLowerCase() ?? "";
    return pathA.includes(q) || pathB.includes(q) || String(c.id).includes(q);
  });

  // Live docket readings for the masthead meta strip and status ledger footer
  const confirmedCount = useMemo(
    () => cases.filter((c) => c.status === "confirmed_clone").length,
    [cases],
  );
  const scopeLabel =
    selectedWs === "all"
      ? t("enterprise.cases.allWorkspaces")
      : workspaces.find((w) => String(w.id) === selectedWs)?.name ?? selectedWs;

  // Status tally for the Register. The docket is fetched server-side per status,
  // so the full distribution only exists in the unfiltered view — surface counts
  // there (the survey moment) and drop them once a status is drilled into, rather
  // than show stale zeros for the statuses that were never loaded.
  const statusCounts = useMemo(() => {
    const acc = {} as Record<CaseStatus, number>;
    for (const c of cases) acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, [cases]);
  const showCounts = statusFilter === "all" && !loading && !error;

  const registerItems = ALL_STATUSES.map((s) => {
    const isAll = s === "all";
    const tone = isAll ? undefined : STATUS_TONE[s as CaseStatus];
    const count = showCounts ? (isAll ? cases.length : statusCounts[s as CaseStatus] ?? 0) : undefined;
    return {
      value: s,
      label: (
        <span className="flex items-center gap-1.5">
          {tone && <span aria-hidden className={cn("h-1.5 w-1.5 rounded-[1px]", TONE_DOT[tone])} />}
          {t(`enterprise.status.${s}`)}
        </span>
      ),
      count,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6" dir={isRTL ? "rtl" : "ltr"}>
      {/* Docket masthead — ruled header + live mono readings */}
      <Masthead
        kicker={t("enterprise.cases.eyebrow", { defaultValue: "Review queue" })}
        title={t("enterprise.cases.title")}
        description={t("enterprise.cases.subtitle")}
      />

      {/* Instrument-document body — scope + status register + docket readings sit in
          the margin rail; the ruled case ledger fills the wide main column. */}
      <DocFrame
        // The rail is charged to the main column, and the docket is an 8-track
        // ledger. 12rem still clears the widest status chip ("Confirmed Clone")
        // and the mono readings, while leaving the case ledger enough width to
        // lay out without a horizontal scrollbar.
        railWidth="12rem"
        rail={
          <>
            {/* Scope — the cross-workspace fetch control */}
            <div>
              {/* A real <label htmlFor>: <button> is a labelable element, so this
                  both names the trigger and makes the caption a click target. */}
              <label htmlFor="rc-scope" className="t-label mb-2.5 block text-muted-foreground/80">
                {t("enterprise.cases.workspace")}
              </label>
              <Select value={selectedWs} onValueChange={setSelectedWs}>
                <SelectTrigger
                  id="rc-scope"
                  aria-label={t("enterprise.cases.workspace")}
                  className="h-9 w-full bg-card font-mono text-xs"
                >
                  <SelectValue placeholder={t("enterprise.cases.allWorkspaces")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("enterprise.cases.allWorkspaces")}</SelectItem>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.id} value={String(ws.id)}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status register — the whole distribution as a visible tally */}
            <div>
              <div id="rc-status-label" className="t-label mb-2.5 text-muted-foreground/80">
                {t("enterprise.cases.colStatus", { defaultValue: "Status" })}
              </div>
              <Register
                items={registerItems}
                active={statusFilter}
                onSelect={(v) => setStatusFilter(v as CaseStatus | "all")}
                // Names the role="group" from the visible caption above it.
                ariaLabelledBy="rc-status-label"
              />
            </div>

            {/* Docket readings — live figures */}
            <RailReadings
              label={t("enterprise.cases.docketLabel", { defaultValue: "Docket" })}
              items={[
                { label: "SCOPE", value: scopeLabel },
                { label: "STATUS", value: t(`enterprise.status.${statusFilter}`) },
                { label: "CASES", value: cases.length },
                { label: "SHOWN", value: `${filtered.length} / ${cases.length}` },
                { label: "CONFIRMED", value: confirmedCount, tone: confirmedCount > 0 ? "danger" : "default" },
              ]}
            />
          </>
        }
      >
        <DocSection
          title={t("enterprise.cases.docket", { defaultValue: "Case docket" })}
          note={
            !loading && !error && cases.length > 0
              ? // `count` drives i18next's plural resolver (en: one/other; ar: the
                // full zero/one/two/few/many/other set) so a single case never
                // reads "1 cases". `n` is passed alongside so the current
                // singular-only "{{n}} cases" string keeps interpolating until the
                // suffixed plural keys land.
                t("enterprise.cases.onDocket", { count: cases.length, n: cases.length })
              : undefined
          }
          actions={
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="rc-find"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("enterprise.cases.searchPlaceholder")}
                aria-label={t("enterprise.cases.searchPlaceholder")}
                className="h-9 bg-card font-mono text-xs ps-9"
              />
            </div>
          }
        >
        {/* Case docket — one ruled ledger; head is constant, states sit left-anchored beneath it */}
        <Ledger columns={LEDGER_COLS}>
          <LedgerHead
            cells={[
              t("enterprise.cases.colCase", { defaultValue: "Case" }),
              t("enterprise.cases.colPaths", { defaultValue: "Artifacts" }),
              t("enterprise.cases.colScore", { defaultValue: "Score" }),
              t("enterprise.cases.colVerdict", { defaultValue: "Verdict" }),
              t("enterprise.cases.colType", { defaultValue: "Clone type" }),
              t("enterprise.cases.colStatus", { defaultValue: "Status" }),
              t("enterprise.cases.workspace"),
              "",
            ]}
            aligns={["start", "start", "end", "start", "start", "start", "start", "end"]}
          />

          {loading ? (
            <LedgerSkeleton rows={6} />
          ) : error ? (
            <LedgerFault onRetry={retry} retryLabel={t("enterprise.common.retry", { defaultValue: "Retry" })}>
              {error}
            </LedgerFault>
          ) : filtered.length === 0 ? (
            <LedgerEmpty>{t("enterprise.cases.noCases")}</LedgerEmpty>
          ) : (
            <>
              {filtered.map((c) => {
                const wsName = workspaces.find((w) => w.id === c.workspaceId)?.name;
                const pathA = c.match?.artifactA?.logicalPath ?? "—";
                const pathB = c.match?.artifactB?.logicalPath ?? "—";
                const score = Math.round(c.confidenceScore);
                const severityText = t(`enterprise.severity.${c.severity}`, { defaultValue: c.severity });
                return (
                  <LedgerRow key={c.id} to={`/enterprise/cases/${c.id}`}>
                    <LedgerCell>
                      <div className="flex items-center gap-2">
                        {/* Decorative: the same severity is printed as a visible
                            text token directly beneath this dot, so exposing it
                            here too would announce every row's severity twice. */}
                        <span
                          aria-hidden="true"
                          className={cn("h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[c.severity] ?? "bg-muted")}
                        />
                        <Serial tone={c.status === "confirmed_clone" ? "primary" : "muted"}>
                          C-{c.id}
                        </Serial>
                      </div>
                      <span className="mt-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {severityText}
                      </span>
                    </LedgerCell>

                    <LedgerCell>
                      <div dir="ltr" className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 font-mono text-muted-foreground/60">A</span>
                          <span className="truncate font-mono text-foreground">{pathA}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0 font-mono text-muted-foreground/60">B</span>
                          <span className="truncate font-mono text-foreground">{pathB}</span>
                        </div>
                      </div>
                    </LedgerCell>

                    <LedgerCell align="end">
                      <ScoreMeter value={score} />
                    </LedgerCell>

                    <LedgerCell>
                      <Verdict score={score} />
                    </LedgerCell>

                    <LedgerCell>
                      <Tag>{c.cloneType.replace(/_/g, " ")}</Tag>
                    </LedgerCell>

                    <LedgerCell>
                      <StatusTag tone={STATUS_TONE[c.status]}>
                        {t(`enterprise.status.${c.status}`, { defaultValue: c.status })}
                      </StatusTag>
                    </LedgerCell>

                    <LedgerCell mono className="text-xs text-muted-foreground">
                      <span className="block truncate">{wsName ?? "—"}</span>
                    </LedgerCell>

                    <LedgerCell align="end">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                        <span className="sr-only">{t("enterprise.cases.viewCase")}</span>
                        <ChevronRight className={cn("h-4 w-4", isRTL && "rotate-180")} aria-hidden />
                      </span>
                    </LedgerCell>
                  </LedgerRow>
                );
              })}
              <LedgerFooter
                left={t("enterprise.cases.showing", { defaultValue: "Showing" })}
                right={`${filtered.length} / ${cases.length}`}
              />
            </>
          )}
        </Ledger>
        </DocSection>
      </DocFrame>
    </div>
  );
}
