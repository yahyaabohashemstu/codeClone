import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Copy, Link2, RotateCcw, Send } from "lucide-react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { RegMark } from "@/components/dossier/Dossier";
import {
  getConversation,
  listConversations,
  sendChatMessage,
  type ChatMessageRow,
} from "@/lib/chatApi";
import { sanitizeHtml } from "@/lib/sanitize";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

// GFM so the analyst's tables/strikethrough render; `breaks` so single
// newlines in a conversational answer don't collapse into one paragraph.
marked.use({ gfm: true, breaks: true });

/** The analyst's note, typeset: markdown → sanitized HTML → margin typography. */
function AnalystNote({ content }: { content: string }) {
  const html = useMemo(() => sanitizeHtml(String(marked.parse(content))), [content]);
  return (
    <div
      className="analysis-markdown chat-markdown"
      dir="auto"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Copy an analyst note's raw text — the small press-tool affordance. */
function CopyNote({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
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
      aria-label={copied ? copiedLabel : label}
      title={copied ? copiedLabel : label}
      className="text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Ruled day break in the correspondence — a slug date on the sheet's rules. */
function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5" aria-hidden>
      <span className="h-px flex-1 bg-border" />
      <span className="press-slug text-[9px]">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * The correspondence log: a PERSISTED analyst thread. Entries load from and
 * save to the server (`chat_conversation` / `chat_message`), so the model has
 * real memory and the thread survives navigation. Ruled annotation blocks
 * with speaker slugs, day breaks, and true timestamps — never bubbles.
 */
export function AnalysisChatPanel({
  analysisId,
  contextLabel,
  conversationId = null,
  onConversationChange,
  onTranscriptChange,
}: {
  analysisId?: number | null;
  contextLabel: string;
  /** Active saved thread; null starts a fresh one on first send. */
  conversationId?: number | null;
  /** Fired when the first send materialises a new conversation id. */
  onConversationChange?: (id: number) => void;
  /** Fired after every stored exchange (lets a rail refresh its listing). */
  onTranscriptChange?: () => void;
}) {
  const { localizeRuntimeMessage, formatDate, isRTL } = useLanguage();
  const { t } = useTranslation("results");

  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [grounded, setGrounded] = useState<boolean>(analysisId != null);
  const [input, setInput] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const lastFailedRef = useRef<string>("");

  const suggestions = [
    t("results.chat.suggestion1"),
    t("results.chat.suggestion2"),
    t("results.chat.suggestion3"),
    t("results.chat.suggestion4"),
  ];

  // Load (or clear) the transcript whenever the active conversation changes.
  useEffect(() => {
    let stale = false;
    setSendError(null);
    setNotice(null);
    setPendingText(null);
    if (conversationId == null) {
      setMessages([]);
      setGrounded(analysisId != null);
      return;
    }
    setLoadingTranscript(true);
    getConversation(conversationId)
      .then((data) => {
        if (stale) return;
        setMessages(data.messages);
        setGrounded(data.conversation.analysisId != null);
      })
      .catch(() => {
        if (!stale) setSendError(t("results.chat.loadFailed", { defaultValue: "Could not open this thread." }));
      })
      .finally(() => {
        if (!stale) setLoadingTranscript(false);
      });
    return () => {
      stale = true;
    };
  }, [conversationId, analysisId, t]);

  // Smart follow: only chase the bottom when the reader is already there.
  const nearBottom = () => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };
  const followRef = useRef(true);
  useEffect(() => {
    if (followRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, pendingText, isSending]);

  const sendMessage = useCallback(
    async (seed?: string) => {
      const content = (seed ?? input).trim();
      if (!content || isSending) return;

      followRef.current = true; // my own message always follows
      setSendError(null);
      setNotice(null);
      setPendingText(content);
      setInput("");
      setIsSending(true);

      try {
        const res = await sendChatMessage({
          message: content,
          conversationId,
          analysisId: conversationId == null ? analysisId : undefined,
        });
        setGrounded(Boolean(res.grounded));

        if (!res.stored) {
          // AI outage: nothing was persisted — surface the operator note and
          // hand the text back so nothing the user typed is lost.
          setPendingText(null);
          setInput(content);
          setNotice(res.response);
          return;
        }

        followRef.current = nearBottom() || true;
        setPendingText(null);
        if (res.userMessage && res.assistantMessage) {
          setMessages((current) => [...current, res.userMessage!, res.assistantMessage!]);
        }
        if (res.conversationId != null && conversationId == null) {
          onConversationChange?.(res.conversationId);
        }
        onTranscriptChange?.();
      } catch (error) {
        setPendingText(null);
        setInput(content);
        lastFailedRef.current = content;
        setSendError(
          error instanceof Error
            ? localizeRuntimeMessage(error.message)
            : t("results.chat.unavailable"),
        );
      } finally {
        setIsSending(false);
      }
    },
    [analysisId, conversationId, input, isSending, localizeRuntimeMessage, onConversationChange, onTranscriptChange, t],
  );

  const speaker = (role: ChatMessageRow["role"]) =>
    role === "assistant"
      ? t("results.chat.speakerAnalyst", { defaultValue: "Analyst" })
      : t("results.chat.speakerYou", { defaultValue: "You" });

  const dayLabel = (iso: string | null) =>
    iso ? formatDate(iso, { dateStyle: "medium" }) : "";
  const timeLabel = (iso: string | null) =>
    iso ? formatDate(iso, { timeStyle: "short" }) : "";

  const isEmptyThread = conversationId == null && messages.length === 0;

  return (
    <div className="flex h-[620px] flex-col overflow-hidden border border-border bg-card">
      {/* Log header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <RegMark className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h3 className="t-h5 truncate text-foreground">{t("results.chat.title")}</h3>
          <p className="press-slug mt-0.5 normal-case tracking-normal">{t("results.chat.description")}</p>
        </div>
        {grounded && (
          <span className="badge-success ms-auto shrink-0">
            <Link2 className="h-3 w-3" />
            {t("results.chat.grounded")}
          </span>
        )}
      </div>

      {/* The correspondence — ruled, numbered annotation entries */}
      <div
        ref={scrollRef}
        onScroll={() => {
          followRef.current = nearBottom();
        }}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        {loadingTranscript ? (
          <div className="flex items-center gap-2.5 px-5 py-5" role="status">
            <RegMark className="h-3.5 w-3.5 animate-spin text-primary [animation-duration:1.6s]" aria-hidden />
            <span className="press-slug">{t("results.chat.loadingThread", { defaultValue: "Opening the file…" })}</span>
          </div>
        ) : (
          <>
            {/* Fresh thread: a local intro card — never part of the record. */}
            {isEmptyThread && (
              <div className="border-b border-border/60 bg-muted/30 px-5 py-4">
                <span className="press-slug flex items-center gap-1.5 text-primary">
                  <span className="reg-dot h-2.5 w-2.5" aria-hidden />
                  {t("results.chat.speakerAnalyst", { defaultValue: "Analyst" })}
                </span>
                <p className="mt-2 text-sm leading-relaxed text-foreground">
                  {t("results.chat.intro", { contextLabel })}
                </p>
              </div>
            )}

            {messages.map((message, index) => {
              const prev = messages[index - 1];
              const breakDay =
                message.createdAt &&
                (!prev || dayLabel(prev.createdAt) !== dayLabel(message.createdAt));
              return (
                <div key={message.id}>
                  {breakDay && <DaySeparator label={dayLabel(message.createdAt)} />}
                  <article
                    className={cn(
                      "animate-fade-in border-b border-border/60 px-5 py-4",
                      message.role === "user" && "bg-muted/40",
                    )}
                  >
                    <header className="flex items-baseline gap-3">
                      <span
                        className={cn(
                          "press-slug flex items-center gap-1.5",
                          message.role === "assistant" ? "text-primary" : "text-foreground",
                        )}
                      >
                        {message.role === "assistant" && <span className="reg-dot h-2.5 w-2.5" aria-hidden />}
                        {speaker(message.role)}
                      </span>
                      <span className="press-slug ms-auto text-[9px]">
                        Nº {String(index + 1).padStart(2, "0")}
                        {message.createdAt ? ` · ${timeLabel(message.createdAt)}` : ""}
                      </span>
                      {message.role === "assistant" && (
                        <CopyNote
                          text={message.content}
                          label={t("results.chat.copyNote", { defaultValue: "Copy" })}
                          copiedLabel={t("apiKeys.keys.copied", { ns: "apiKeys", defaultValue: "Copied" })}
                        />
                      )}
                    </header>
                    <div className="mt-2.5">
                      {message.role === "assistant" ? (
                        <AnalystNote content={message.content} />
                      ) : (
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground" dir="auto">
                          {message.content}
                        </div>
                      )}
                    </div>
                  </article>
                </div>
              );
            })}

            {/* Optimistic entry for the in-flight question */}
            {pendingText && (
              <article className="border-b border-border/60 bg-muted/40 px-5 py-4 opacity-80">
                <header className="flex items-baseline gap-3">
                  <span className="press-slug text-foreground">{speaker("user")}</span>
                  <span className="press-slug ms-auto text-[9px]">…</span>
                </header>
                <div className="mt-2.5 whitespace-pre-wrap text-sm leading-relaxed text-foreground" dir="auto">
                  {pendingText}
                </div>
              </article>
            )}

            {isSending && (
              <div className="flex items-center gap-2.5 px-5 py-4" role="status">
                <RegMark className="h-3.5 w-3.5 animate-spin text-primary [animation-duration:1.6s]" aria-hidden />
                <span className="press-slug">{t("results.chat.thinking", { defaultValue: "Reading the proof…" })}</span>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Delivery failure / outage strips — never forged into the record */}
      {sendError && (
        <div className="flex items-center gap-2.5 border-t border-destructive/40 bg-destructive/5 px-5 py-2.5" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs text-destructive">{sendError}</span>
          {lastFailedRef.current && (
            <button
              type="button"
              onClick={() => void sendMessage(lastFailedRef.current)}
              className="press-slug flex shrink-0 items-center gap-1 text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              {t("results.chat.retry", { defaultValue: "Retry" })}
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="flex items-center gap-2.5 border-t border-warning/50 bg-warning/10 px-5 py-2.5" role="status">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
          <span className="min-w-0 flex-1 text-xs text-foreground">{notice}</span>
        </div>
      )}

      {/* Prompts + the console */}
      <div className="border-t border-border">
        {messages.length === 0 && !loadingTranscript && (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 px-5 py-2.5">
            <span className="press-slug text-[9px]">{t("results.chat.suggestionsLabel", { defaultValue: "Ask" })}</span>
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => void sendMessage(suggestion)}
                className="text-xs text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className={cn("flex items-stretch", messages.length === 0 && !loadingTranscript && "border-t border-border")}>
          <input
            type="text"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void sendMessage();
              }
            }}
            placeholder={t("results.chat.placeholder")}
            className="h-12 min-w-0 flex-1 border-0 bg-card px-5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/40"
          />
          <Button
            size="icon"
            className="h-12 w-14 shrink-0 rounded-none"
            onClick={() => void sendMessage()}
            disabled={!input.trim() || isSending}
            aria-label={t("results.chat.send", { defaultValue: "Send" })}
          >
            <Send className={cn("h-4 w-4", isRTL && "rotate-180")} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * The Results-tab thread: resolves (once per analysis) the latest saved
 * conversation grounded in that analysis and resumes it, so "Ask AI" always
 * reopens the analysis's own correspondence instead of starting amnesiac.
 */
export function GroundedThread({
  analysisId,
  contextLabel,
}: {
  analysisId?: number | null;
  contextLabel: string;
}) {
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [resolved, setResolved] = useState(analysisId == null);

  useEffect(() => {
    let stale = false;
    setConversationId(null);
    if (analysisId == null) {
      setResolved(true);
      return;
    }
    setResolved(false);
    listConversations({ analysisId, limit: 1 })
      .then((data) => {
        if (!stale) setConversationId(data.items[0]?.id ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!stale) setResolved(true);
      });
    return () => {
      stale = true;
    };
  }, [analysisId]);

  if (!resolved) {
    return (
      <div className="flex h-[620px] items-center justify-center border border-border bg-card" role="status">
        <RegMark className="h-5 w-5 animate-spin text-primary [animation-duration:1.6s]" aria-hidden />
      </div>
    );
  }

  return (
    <AnalysisChatPanel
      analysisId={analysisId}
      contextLabel={contextLabel}
      conversationId={conversationId}
      onConversationChange={setConversationId}
    />
  );
}
