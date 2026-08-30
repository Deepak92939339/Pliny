import { NextResponse } from "next/server";
import { z } from "zod";
import { retrieveRelevantChunks } from "@/lib/search/retrieveChunks";
import { createClient } from "@/lib/supabase/server";
import type { SearchResponse } from "@/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const searchChunksSchema = z.object({
  collection_id: z.string().uuid("Invalid project id."),
  document_ids: z.array(z.string().uuid("Invalid document id.")).max(10, "Too many documents selected.").optional(),
  query: z.string().trim().min(2, "Enter a question to search.").max(500, "Question is too long."),
});

function logSearchError(step: string, error: unknown) {
  if (error instanceof Error) {
    console.error("[search-chunks]", step, {
      message: error.message,
      name: error.name,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    });
    return;
  }

  console.error("[search-chunks]", step, error);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    if (userError) {
      logSearchError("auth user check failed", userError);
    }

    return NextResponse.json({ error: "You must be logged in to search documents." }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsedBody = searchChunksSchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? "Invalid search request." }, { status: 400 });
  }

  const { collection_id: collectionId, document_ids: documentIds, query } = parsedBody.data;

  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (collectionError) {
    logSearchError("collection ownership lookup failed", collectionError);
    return NextResponse.json({ error: "Unable to verify this project." }, { status: 500 });
  }

  if (!collection) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const { error: chunksError, missingRequiredDocumentIds, results, retrievalReason } = await retrieveRelevantChunks(supabase, {
    collectionId,
    documentIds,
    query,
    userId: user.id,
  });

  if (chunksError) {
    logSearchError("chunk lookup failed", chunksError);
    return NextResponse.json({ error: "Unable to search document passages right now." }, { status: 500 });
  }

  const response: SearchResponse = {
    collectionId,
    missingRequiredDocumentIds,
    query,
    retrievalReason,
    results,
  };

  return NextResponse.json(response);
}
