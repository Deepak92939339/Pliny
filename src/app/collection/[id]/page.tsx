import { WorkspaceView } from "@/components/workspace/WorkspaceView";
import { getCurrentUser } from "@/lib/auth/session";
import { getRecentChatMessages } from "@/lib/chat/queries";
import { collectionIdSchema } from "@/lib/collections/schema";
import { getCollectionForUser, getCollectionsForUser } from "@/lib/collections/queries";
import { getDocumentsForCollection } from "@/lib/documents/queries";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

type CollectionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { id } = await params;
  const parsedCollectionId = collectionIdSchema.safeParse(id);

  if (!parsedCollectionId.success) {
    notFound();
  }

  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { collection, error } = await getCollectionForUser(parsedCollectionId.data, user.id);

  if (error) {
    return <WorkspaceView errorMessage={error} />;
  }

  if (!collection) {
    notFound();
  }

  const { documents, error: documentsError } = await getDocumentsForCollection(collection.id, user.id);
  const { collections } = await getCollectionsForUser(user.id);
  const supabase = await createClient();
  const { error: chatError, messages } = await getRecentChatMessages({
    collectionId: collection.id,
    supabase,
    userId: user.id,
  });
  const collectionWithDocumentCount = {
    ...collection,
    documentCount: documents.length,
  };

  return (
    <WorkspaceView
      chatError={chatError}
      collection={collectionWithDocumentCount}
      collections={collections}
      documents={documents}
      documentsError={documentsError}
      initialMessages={messages}
      userEmail={user.email ?? null}
      userId={user.id}
    />
  );
}
