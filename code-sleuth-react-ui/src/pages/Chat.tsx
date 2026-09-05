import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { PageHeader, Tag } from "@/components/bench/Bench";
import { Panel } from "@/components/dossier/Dossier";
import { IconFilePlus } from "@/components/bench/icons";
import {
  deleteConversation,
  listConversations,
  type ChatConversationSummary,
} from "@/lib/chatApi";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

/**
 * The analyst's desk: a ruled list of saved threads beside the live
 * transcript. A fresh thread grounds on the currently loaded analysis when
 * one is on file; every thread is persisted server-side and can be reopened,
 * resumed (the model keeps its memory), or deleted.
 */
const Chat = () => {
  const { currentResult } = useAnalysis();
  const { t } = useTranslation("common");
  const { formatDate, formatNumber } = useLanguage();

  const [items, setItems] = useState<ChatConversationSummary[]>([]);
  const [listLoaded, setListLoaded] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ChatConversationSummary | null>(null);

  const refreshList = useCallback(() => {
    listConversations({})
      .then((data) => setItems(data.items))
      .catch(() => undefined)
      .finally(() => setListLoaded(true));
  }, []);

  useEffect(() => {
    refreshList();
  }, [refreshList]);

  const active = activeId != null ? items.find((c) => c.id === activeId) ?? null : null;

  // A fresh thread inherits the grounding of whatever analysis is on file.
  const freshAnalysisId = currentResult?.saved_analysis_id ?? null;
  const contextLabel = currentResult
    ? `${currentResult.source_labels.code1} ↔ ${currentResult.source_labels.code2}`
    : t("chat.noContextLabel", { defaultValue: "general" });

  const executeDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    try {
      await deleteConversation(target.id);
      if (activeId === target.id) setActiveId(null);
      refreshList();
    } catch {
      // The list refresh below would surface a stale row; keep it simple.
      refreshList();
    }
  };

  const railDate = (c: ChatConversationSummary) =>
    c.updatedAt ? formatDate(c.updatedAt, { dateStyle: "medium" }) : "—";

  const openCaseId = active?.analysisId ?? (activeId == null ? freshAnalysisId : null);

  return (
    <div className="pt-7">
      <PageHeader
        kicker={t("topbar.analyst")}
        title={t("chat.pageTitle")}
        actions={
          <Button onClick={() => setActiveId(null)}>
            <IconFilePlus size={16} />
            {t("chat.newConversation", { defaultValue: "New thread" })}
          </Button>
        }
      />
      <p className="body-lg mt-3 max-w-[64ch] text-txt-secondary">{t("chat.pageDescription")}</p>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* Threads */}
        <aside className="min-w-0">
          <Panel
            label={t("chat.previousTitle", { defaultValue: "Correspondence" })}
            actions={<span className="mono-meta text-txt-muted">{formatNumber(items.length)}</span>}
            bodyClassName="p-0"
          >
            {/* New thread — the list's first slot */}
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className={cn(
                "flex w-full min-w-0 flex-col gap-1.5 border-b border-bench-hair px-5 py-3 text-start transition-colors",
                activeId == null ? "text-txt-primary" : "text-txt-secondary hover:text-txt-primary",
              )}
            >
              <span className={cn("block truncate text-[13px]", activeId == null && "font-semibold")}>
                {t("chat.newConversation", { defaultValue: "New thread" })}
              </span>
              <span className="mono-meta text-txt-muted">
                {freshAnalysisId != null
                  ? t("chat.groundsOnCase", { defaultValue: "Case #{{id}}", id: freshAnalysisId })
                  : t("chat.ungrounded", { defaultValue: "Free consultation" })}
              </span>
            </button>

            <div className="max-h-[520px] overflow-y-auto scrollbar-thin [&>*:last-child]:border-b-0">
              {!listLoaded ? (
                <div className="px-5 py-4" role="status">
                  <span className="mono-meta text-txt-muted">{t("status.loading")}</span>
                </div>
              ) : items.length === 0 ? (
                <p className="px-5 py-4 text-[12.5px] leading-relaxed text-txt-muted">
                  {t("chat.noThreadsYet", { defaultValue: "Nothing on file yet — your first exchange is saved automatically." })}
                </p>
              ) : (
                items.map((c) => {
                  const isActive = c.id === activeId;
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "group relative border-b border-bench-hair px-5",
                        isActive && "border-s-2 border-s-signal ps-[18px]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveId(c.id)}
                        className="block w-full min-w-0 py-3 pe-8 text-start"
                      >
                        <span className={cn("block truncate text-[13px]", isActive ? "font-semibold text-txt-primary" : "text-txt-secondary group-hover:text-txt-primary")} dir="auto">
                          {c.title || "…"}
                        </span>
                        <span className="mono-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-txt-muted">
                          <span>{railDate(c)}</span>
                          <span aria-hidden>·</span>
                          <span>
                            {formatNumber(c.messageCount ?? 0)} {t("chat.messagesShort", { defaultValue: "msgs" })}
                          </span>
                          {c.analysisId != null && (
                            <>
                              <span aria-hidden>·</span>
                              <span className="text-txt-secondary">#{c.analysisId}</span>
                            </>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(c)}
                        aria-label={t("buttons.delete")}
                        title={t("buttons.delete")}
                        className="absolute end-4 top-1/2 -translate-y-1/2 p-1 text-txt-muted opacity-0 transition-opacity hover:text-signal-bench focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </Panel>
        </aside>

        {/* Transcript */}
        <div className="min-w-0">
          <Panel
            label={t("chat.transcriptTitle", { defaultValue: "Transcript" })}
            actions={
              openCaseId != null ? (
                <Link to={`/results?analysisId=${openCaseId}`} className="shrink-0" aria-label={t("chat.openCase", { defaultValue: "Case #{{id}}", id: openCaseId })}>
                  <Tag tone="advisory">{t("chat.openCase", { defaultValue: "Case #{{id}}", id: openCaseId })}</Tag>
                </Link>
              ) : undefined
            }
          >
            {/* Context line for the open thread */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bench-hair pb-3">
              <span className="min-w-0 truncate text-[12.5px] text-txt-secondary" dir="auto">
                {active ? active.title : t("chat.newConversation", { defaultValue: "New thread" })}
              </span>
            </div>

            <div className="mt-4">
              <AnalysisChatPanel
                analysisId={activeId == null ? freshAnalysisId : undefined}
                contextLabel={contextLabel}
                conversationId={activeId}
                onConversationChange={(id) => {
                  setActiveId(id);
                  refreshList();
                }}
                onTranscriptChange={refreshList}
              />
            </div>
          </Panel>
        </div>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-bench-strong bg-bench-raised text-txt-primary">
          <AlertDialogHeader>
            <AlertDialogTitle className="t-h4">{t("chat.deleteTitle", { defaultValue: "Delete this thread?" })}</AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-txt-secondary">
              {t("chat.deleteDescription", {
                defaultValue: "The whole transcript is removed permanently. This cannot be undone.",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("buttons.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeDelete()}>
              {t("buttons.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Chat;
