import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useLanguage } from "@/context/LanguageContext";
import {
  Panel,
  MetaStrip,
  StatusTag,
  Serial,
  Field,
  Transcript,
  TranscriptTurn,
} from "@/components/dossier/Dossier";

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

  const speakerFor = (role: ChatMessage["role"]) =>
    role === "assistant" ? t("results.chat.speakerAssistant") : t("results.chat.speakerUser");

  return (
    <div className="space-y-4">
      {/* Document header line: the state of the record at a glance, in instrument voice. */}
      <MetaStrip
        items={[
          {
            label: t("results.chat.grounding"),
            value: (
              <span className={grounded ? "text-success" : "text-muted-foreground"}>
                {grounded ? t("results.chat.groundingLive") : t("results.chat.groundingNone")}
              </span>
            ),
          },
          { label: t("results.chat.turns"), value: messages.length },
          { label: t("results.chat.mode"), value: t("results.chat.modeValue") },
        ]}
      />

      <Panel
        label={t("results.chat.record")}
        actions={
          <StatusTag tone={grounded ? "ok" : "warn"}>
            {grounded ? t("results.chat.statusGrounded") : t("results.chat.statusUngrounded")}
          </StatusTag>
        }
        bodyClassName="flex h-[620px] flex-col p-0"
      >
        {/* The examination log — margin-labelled turns, no bubbles or avatars. */}
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <Transcript className="px-5 pb-2">
            {messages.map((message, i) => (
              <TranscriptTurn
                key={message.id}
                role={message.role}
                serial={<Serial tone={message.role === "assistant" ? "primary" : "muted"}>{String(i + 1).padStart(2, "0")}</Serial>}
                speaker={speakerFor(message.role)}
                time={message.time}
              >
                {message.content}
              </TranscriptTurn>
            ))}

            {isSending && (
              <TranscriptTurn
                role="assistant"
                serial={<Serial tone="primary">··</Serial>}
                speaker={t("results.chat.speakerAssistant")}
              >
                <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {t("results.chat.examining")}
                  <span className="inline-flex items-center gap-1" aria-hidden="true">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: "0ms" }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: "150ms" }} />
                    <span className="h-1 w-1 animate-bounce rounded-full bg-primary/60 motion-reduce:animate-none" style={{ animationDelay: "300ms" }} />
                  </span>
                </span>
              </TranscriptTurn>
            )}

            <div ref={bottomRef} />
          </Transcript>
        </div>

        {/* Composer: a ruled index of stock queries, then a Field-framed input row. */}
        <div className="shrink-0 border-t border-border">
          <div className="t-label px-5 pt-4">{t("results.chat.inquiry")}</div>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {suggestions.map((suggestion, i) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => void sendMessage(suggestion)}
                  disabled={isSending}
                  className="flex w-full items-center gap-3 px-5 py-2 text-start transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Serial>{String(i + 1).padStart(2, "0")}</Serial>
                  <span className="text-sm text-muted-foreground">{suggestion}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="px-5">
            <Field label={t("results.chat.enterQuery")} align="center">
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
                  aria-label={t("results.chat.enterQuery")}
                  className="h-11 flex-1 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:border-primary/60 focus:outline-none focus:ring-1 focus:ring-primary/20 placeholder:text-muted-foreground/50"
                />
                <Button
                  size="icon"
                  className="h-11 w-11 rounded-md"
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || isSending}
                  aria-label={t("results.chat.send")}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Field>
          </div>
        </div>
      </Panel>
    </div>
  );
}
