import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDocumentWithDependencies } from "@/lib/documents/deleteDocument";
import { checkRouteRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const documentIdSchema = z.string().uuid();

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "You must be logged in to delete documents." }, { status: 401 });
  }

  const deleteLimit = await checkRouteRateLimit({
    identifier: user.id,
    limit: 20,
    prefix: "documents-delete-minute",
    window: "1 m",
  });

  if (deleteLimit.status === "blocked") {
    const rateLimited = deleteLimit.reason === "rate_limited";
    return NextResponse.json(
      { error: rateLimited ? "You have reached the document delete limit for now." : "Document deletion is temporarily unavailable. Please try again later." },
      {
        status: rateLimited ? 429 : 503,
        headers: rateLimited ? { "Retry-After": String(Math.max(1, Math.ceil((deleteLimit.resetAt - Date.now()) / 1000))) } : undefined,
      }
    );
  }

  const { id } = await params;
  const parsed = documentIdSchema.safeParse(id);

  if (!parsed.success) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const result = await deleteDocumentWithDependencies(supabase, {
    documentId: parsed.data,
    userId: user.id,
  });

  if (result.ok) {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json({ error: result.error }, { status: result.status });
}
