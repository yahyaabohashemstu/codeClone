import { apiFetch } from "@/lib/api";

export interface ChatMessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  grounded: boolean;
  createdAt: string | null;
}

export interface ChatConversationSummary {
  id: number;
  title: string;
  analysisId: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  messageCount?: number;
}

export interface SendChatResult {
  response: string;
  grounded: boolean;
  stored: boolean;
  conversationId: number | null;
  userMessage?: ChatMessageRow;
  assistantMessage?: ChatMessageRow;
}

/** List the caller's saved analyst threads, newest activity first. */
export async function listConversations(opts: { analysisId?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (opts.analysisId != null) params.set("analysisId", String(opts.analysisId));
  if (opts.limit != null) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<{ items: ChatConversationSummary[] }>(
    `/api/v1/chat/conversations${qs ? `?${qs}` : ""}`,
  );
}

/** One conversation with its full transcript (ownership-checked server-side). */
export async function getConversation(id: number) {
  return apiFetch<{ conversation: ChatConversationSummary; messages: ChatMessageRow[] }>(
    `/api/v1/chat/conversations/${id}`,
  );
}

export async function renameConversation(id: number, title: string) {
  return apiFetch<{ conversation: ChatConversationSummary }>(
    `/api/v1/chat/conversations/${id}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
}

export async function deleteConversation(id: number) {
  return apiFetch<{ success: boolean }>(`/api/v1/chat/conversations/${id}`, { method: "DELETE" });
}

/** Send a message — creates a conversation on first send, resumes otherwise. */
export async function sendChatMessage(payload: {
  message: string;
  conversationId?: number | null;
  analysisId?: number | null;
}) {
  return apiFetch<SendChatResult>("/api/v1/chat", {
    method: "POST",
    body: JSON.stringify({
      message: payload.message,
      ...(payload.conversationId != null ? { conversationId: payload.conversationId } : {}),
      ...(payload.analysisId != null ? { analysisId: payload.analysisId } : {}),
    }),
  });
}
