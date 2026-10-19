import { handleProcessDocument } from "@/lib/documents/processDocument";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel Functions with Fluid Compute allow up to 300 s on every plan. The watchdog's stall
// window (PROCESSING_STALL_MINUTES, minimum 6) is deliberately longer than this.
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  return handleProcessDocument(id);
}
