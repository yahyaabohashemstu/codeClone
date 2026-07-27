import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Link2, Send } from "lucide-react";
import { marked } from "marked";
import { Button } from "@/components/ui/button";
import { RegMark } from "@/components/dossier/Dossier";
import { apiFetch } from "@/lib/api";
import { sanitizeHtml } from "@/lib/sanitize";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

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

/**
 * The correspondence log: questions and readings exchanged in the proof's
 * margin. Entries are ruled annotation blocks with speaker slugs — the
 * analyst writes on the sheet, the reviewer's notes sit on a muted tint —
 * not messenger bubbles.
 */
export function AnalysisChatPanel({
  analysisId,
  contextLabel,
}: {
  analysisId?: number | null;
  contextLabel: string;
}) {
  const { localizeRuntimeMessage } = useLanguage();
  const { t } = useTranslation("results");

  const intro = t("results.chat.intro", { contextLabel });
  const justNow = t("results.chat.justNow");

  // Keep the latest localized strings available to the context-reset effect
  // without making that effect re-run (and wipe a live conversation) on a mere
  // language switch.
  const introRef = useRef(intro);
  introRef.current = intro;
  const justNowRef = useRef(justNow);
  justNowRef.current = justNow;

  const suggestions = [
    t("results.chat.suggestion1"),
    t("results.chat.suggestion2"),
    t("results.chat.suggestion3"),
    t("results.chat.suggestion4"),
  ];

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: intro,
      time: justNow,
    },
  ]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  // The panel can ground answers only when it has a real analysis id to send;
  // the server confirms (or corrects) this per response. Drives the "Grounded"
  // trust badge so it never claims grounding that isn't actually attached.
  const [grounded, setGrounded] = useState<boolean>(analysisId != null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Reset the thread whenever the viewed analysis (or its label) changes, so a
  // prior conversation about one pair can never bleed into another.
  useEffect(() => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: introRef.current,
        time: justNowRef.current,
      },
    ]);
    setInput("");
    setGrounded(analysisId != null);
  }, [analysisId, contextLabel]);

  // Re-localize the intro on a language switch without discarding a live thread.
  useEffect(() => {
    setMessages((current) => {
      if (current.length === 1 && current[0]?.role === "assistant") {
        return [{ ...current[0], content: intro, time: justNow }];
      }
      return current;
    });
  }, [intro, justNow]);

  const sendMessage = async (seed?: string) => {
    const content = (seed ?? input).trim();
    if (!content || isSending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      time: justNow,
    };

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const response = await apiFetch<{ response: string; grounded?: boolean }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          message: content,
          ...(analysisId != null ? { analysisId } : {}),
        }),
      });

      setGrounded(Boolean(response.grounded));
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.response,
          time: justNow,
        },
      ]);
    } catch (error) {
      const message = error instanceof Error ? localizeRuntimeMessage(error.message) : t("results.chat.unavailable");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: message,
          time: justNow,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const speaker = (role: ChatMessage["role"]) =>
    role === "assistant"
      ? t("results.chat.speakerAnalyst", { defaultValue: "Analyst" })
      : t("results.chat.speakerYou", { defaultValue: "You" });

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
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.map((message, index) => (
          <article
            key={message.id}
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
                Nº {String(index + 1).padStart(2, "0")} · {message.time}
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
        ))}

        {isSending && (
          <div className="flex items-center gap-2.5 px-5 py-4" role="status">
            <RegMark className="h-3.5 w-3.5 animate-spin text-primary [animation-duration:1.6s]" aria-hidden />
            <span className="press-slug">{t("results.chat.thinking", { defaultValue: "Reading the proof…" })}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Prompts + the console */}
      <div className="border-t border-border">
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
        <div className="flex items-stretch border-t border-border">
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
            <Send className="h-4 w-4 rtl:rotate-180" />
          </Button>
        </div>
      </div>
    </div>
  );
}
