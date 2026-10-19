import { handleProcessDocument } from "@/lib/documents/processDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Legacy entry point kept for existing callers; prefer POST /api/documents/{id}/process. */
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const documentId = body && typeof body === "object" ? (body as { document_id?: unknown }).document_id : undefined;

  return handleProcessDocument(documentId);
}
