import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AnalysisChatPanel } from "@/components/results/AnalysisChatPanel";
import { Masthead, RegMark } from "@/components/dossier/Dossier";
import {
  deleteConversation,
  listConversations,
  type ChatConversationSummary,
} from "@/lib/chatApi";
import { useAnalysis } from "@/context/AnalysisContext";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

/**
 * The correspondence desk: the previous-threads drawer beside the live log.
 * A fresh thread grounds on the currently loaded analysis when one is on
 * file; every thread is persisted server-side and can be reopened, resumed
 * (the model keeps its memory), or destroyed.
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

  return (
    <div className="animate-fade-in">
      <Masthead
        kicker={t("chat.eyebrow", { defaultValue: "Grounded consultation" })}
        title={t("chat.pageTitle")}
        description={t("chat.pageDescription")}
        actions={
          <Button size="sm" className="h-9 gap-2" onClick={() => setActiveId(null)}>
            <Plus className="h-4 w-4" />
            {t("chat.newConversation", { defaultValue: "New thread" })}
          </Button>
        }
      />

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        {/* ── The correspondence drawer ── */}
        <aside className="min-w-0 border border-border bg-card">
          <div className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-2.5">
            <span className="t-label flex items-center gap-2 text-foreground">
              <span className="reg-dot h-3 w-3 text-primary" aria-hidden />
              {t("chat.previousTitle", { defaultValue: "Correspondence" })}
            </span>
            <span className="press-slug tabular-nums">{formatNumber(items.length)}</span>
          </div>

          {/* New thread — the drawer's first slot */}
          <button
            type="button"
            onClick={() => setActiveId(null)}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 border-b border-border/60 px-4 py-3 text-start transition-colors",
              activeId == null ? "nav-link-active" : "hover:bg-muted/60",
            )}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-foreground">
                {t("chat.newConversation", { defaultValue: "New thread" })}
              </span>
              <span className="press-slug mt-0.5 block text-[9px]">
                {freshAnalysisId != null
                  ? t("chat.groundsOnCase", { defaultValue: "Case #{{id}}", id: freshAnalysisId })
                  : t("chat.ungrounded", { defaultValue: "Free consultation" })}
              </span>
            </span>
          </button>

          <div className="max-h-[520px] overflow-y-auto scrollbar-thin">
            {!listLoaded ? (
              <div className="flex items-center gap-2.5 px-4 py-4" role="status">
                <RegMark className="h-3.5 w-3.5 animate-spin text-primary [animation-duration:1.6s]" aria-hidden />
                <span className="press-slug">{t("status.loading")}</span>
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-5 text-xs leading-relaxed text-muted-foreground">
                {t("chat.noThreadsYet", { defaultValue: "Nothing on file yet — your first exchange is saved automatically." })}
              </p>
            ) : (
              items.map((c) => {
                const isActive = c.id === activeId;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative border-b border-border/60 transition-colors last:border-b-0",
                      isActive ? "nav-link-active" : "hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className="block w-full min-w-0 px-4 py-3 pe-9 text-start"
                    >
                      <span className="block truncate text-[13px] font-medium text-foreground" dir="auto">
                        {c.title || "…"}
                      </span>
                      <span className="press-slug mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px]">
                        <span className="normal-case tracking-normal">{railDate(c)}</span>
                        <span aria-hidden>·</span>
                        <span className="tabular-nums">
                          {formatNumber(c.messageCount ?? 0)} {t("chat.messagesShort", { defaultValue: "msgs" })}
                        </span>
                        {c.analysisId != null && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="text-primary">#{c.analysisId}</span>
                          </>
                        )}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(c)}
                      aria-label={t("buttons.delete")}
                      title={t("buttons.delete")}
                      className="absolute end-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground/60 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ── The live log ── */}
        <div className="min-w-0">
          {/* Context line for the open thread */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <span className="press-slug flex min-w-0 items-center gap-2">
              <span className="truncate normal-case tracking-normal" dir="auto">
                {active ? active.title : t("chat.newConversation", { defaultValue: "New thread" })}
              </span>
            </span>
            {(active?.analysisId ?? (activeId == null ? freshAnalysisId : null)) != null && (
              <Link
                to={`/results?analysisId=${active?.analysisId ?? freshAnalysisId}`}
                className="press-slug text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
              >
                {t("chat.openCase", { defaultValue: "Case #{{id}}", id: active?.analysisId ?? freshAnalysisId })}
              </Link>
            )}
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
        </div>
      </div>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chat.deleteTitle", { defaultValue: "Delete this thread?" })}</AlertDialogTitle>
            <AlertDialogDescription>
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
