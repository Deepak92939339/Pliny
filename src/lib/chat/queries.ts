import type { ChatCitation, ChatMessageRow, WorkspaceSearchResult } from "@/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
export const MAX_CHAT_HISTORY_MESSAGES = 1_000;
const CHAT_HISTORY_PAGE_SIZE = 200;

export async function getRecentChatMessages({
  collectionId,
  limit = MAX_CHAT_HISTORY_MESSAGES,
  supabase,
  userId,
}: {
  collectionId: string;
  limit?: number;
  supabase: SupabaseServerClient;
  userId: string;
}) {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 2), MAX_CHAT_HISTORY_MESSAGES);
  const rowsDescending: ChatMessageRow[] = [];

  for (let offset = 0; offset <= boundedLimit; offset += CHAT_HISTORY_PAGE_SIZE) {
    const pageEnd = Math.min(offset + CHAT_HISTORY_PAGE_SIZE - 1, boundedLimit);
    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, collection_id, user_id, role, content, provider_safe_content, processing_mode, citations, created_at")
      .eq("collection_id", collectionId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, pageEnd);

    if (error) {
      return { error: "Unable to load previous messages.", messages: [] as WorkspaceSearchResult[], truncated: false };
    }

    const page = (data ?? []) as ChatMessageRow[];
    rowsDescending.push(...page);
    if (page.length < pageEnd - offset + 1 || rowsDescending.length > boundedLimit) break;
  }

  const truncated = rowsDescending.length > boundedLimit;
  const rows = rowsDescending.slice(0, boundedLimit).reverse();
  const results: WorkspaceSearchResult[] = [];
  let userMessage: ChatMessageRow | null = null;

  for (const row of rows) {
    if (row.role === "user") {
      userMessage = row;
      continue;
    }

    if (row.role !== "assistant" || !userMessage) {
      continue;
    }

    const assistantMessage = row;
    const citations = (assistantMessage.citations ?? []) as ChatCitation[];
    const sources = citations.map((citation) => citation.source).filter(Boolean);

    results.push({
      answer: assistantMessage.content,
      citations,
      collectionId: collectionId,
      createdAt: new Date(assistantMessage.created_at).toLocaleString(),
      id: assistantMessage.id,
      metadata: {
        maxOutputTokens: 0,
        model: "saved",
        modelReason: "Loaded from chat history.",
        retrievalReason: sources.length > 0 ? "direct_keyword_match" : "no_chunks_found",
      },
      question: userMessage.content,
      privacyMode: assistantMessage.processing_mode ?? userMessage.processing_mode ?? "standard",
      providerSafeAnswer: assistantMessage.provider_safe_content ?? undefined,
      providerSafeQuestion: userMessage.provider_safe_content ?? undefined,
      retrievalReason: sources.length > 0 ? "direct_keyword_match" : "no_chunks_found",
      sources,
      status: "answered",
    });
    userMessage = null;
  }

  return { error: null, messages: results, truncated };
}
