import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { reapStaleDocuments } from "@/lib/documents/lifecycle";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return false;
  }

  const provided = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Scheduled sweep (see vercel.json): fails abandoned uploads, fails stalled processing and
 * removes orphaned objects. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await reapStaleDocuments(createAdminClient(), { sweepLateObjects: true });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron-maintenance] sweep failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Maintenance sweep failed." }, { status: 500 });
  }
}
