import { createClient } from "@/lib/supabase/server";
import type { CollectionListItem, CollectionRow } from "@/types";

type CollectionsResult = {
  collections: CollectionListItem[];
  error: string | null;
};

type CollectionResult = {
  collection: CollectionListItem | null;
  error: string | null;
};

async function getDocumentCount(collectionId: string, userId: string) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("collection_id", collectionId)
    .eq("user_id", userId);

  return count ?? 0;
}

async function mapCollectionRow(row: CollectionRow, userId: string): Promise<CollectionListItem> {
  return {
    createdAt: row.created_at,
    description: row.description,
    documentCount: await getDocumentCount(row.id, userId),
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
  };
}

export async function getCollectionsForUser(userId: string): Promise<CollectionsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id,name,description,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return {
      collections: [],
      error: "Unable to load projects right now. Please refresh and try again.",
    };
  }

  const rows = (data ?? []) as CollectionRow[];

  return {
    collections: await Promise.all(rows.map((row) => mapCollectionRow(row, userId))),
    error: null,
  };
}

export async function getCollectionForUser(collectionId: string, userId: string): Promise<CollectionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id,user_id,name,description,created_at,updated_at")
    .eq("id", collectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return {
      collection: null,
      error: "Unable to load this project right now. Please try again.",
    };
  }

  if (!data) {
    return {
      collection: null,
      error: null,
    };
  }

  return {
    collection: await mapCollectionRow(data as CollectionRow, userId),
    error: null,
  };
}
