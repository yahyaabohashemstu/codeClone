import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Link2, MessageSquare, ScanSearch, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
}

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

  return (
    <div className="card-premium flex h-[620px] flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-4">
        <MessageSquare className="h-4 w-4 text-primary" />
        <div>
          <h3 className="font-display text-sm font-semibold text-foreground">{t("results.chat.title")}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t("results.chat.description")}</p>
        </div>
        {grounded && (
          <span className="ml-auto badge-success">
            <Link2 className="h-3 w-3" />
            {t("results.chat.grounded")}
          </span>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 scrollbar-thin">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12">
                <ScanSearch className="h-4 w-4 text-primary" />
              </div>
            )}

            <div className="max-w-[82%] space-y-1">
              <div className={message.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"}>
                <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
              </div>
              <div className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", message.role === "user" ? "justify-end" : "justify-start")}>
                <Clock className="h-2.5 w-2.5" />
                {message.time}
              </div>
            </div>

            {message.role === "user" && (
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {isSending && (
          <div className="flex gap-3 justify-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12">
              <ScanSearch className="h-4 w-4 text-primary" />
            </div>
            <div className="chat-bubble-ai flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/50" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border/50 px-4 py-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void sendMessage(suggestion)}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
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
            className="input-focus h-11 flex-1 rounded-md border border-border bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground/40"
          />
          <Button size="icon" className="h-11 w-11 rounded-md" onClick={() => void sendMessage()} disabled={!input.trim() || isSending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
