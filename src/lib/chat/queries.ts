import type { ChatCitation, ChatMessageRow, WorkspaceSearchResult } from "@/types";
import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function getRecentChatMessages({
  collectionId,
  limit = 20,
  supabase,
  userId,
}: {
  collectionId: string;
  limit?: number;
  supabase: SupabaseServerClient;
  userId: string;
}) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, collection_id, user_id, role, content, citations, created_at")
    .eq("collection_id", collectionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { error: "Unable to load previous messages.", messages: [] as WorkspaceSearchResult[] };
  }

  const rows = ((data ?? []) as ChatMessageRow[]).reverse();
  const results: WorkspaceSearchResult[] = [];

  for (let index = 0; index < rows.length; index += 2) {
    const userMessage = rows[index];
    const assistantMessage = rows[index + 1];

    if (!userMessage || userMessage.role !== "user") {
      continue;
    }

    if (!assistantMessage || assistantMessage.role !== "assistant") {
      continue;
    }

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
      retrievalReason: sources.length > 0 ? "direct_keyword_match" : "no_chunks_found",
      sources,
      status: "answered",
    });
  }

  return { error: null, messages: results };
}
