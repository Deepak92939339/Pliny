import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirect } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectWithoutCaching(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

const VERIFIABLE_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>([
  "email",
  "recovery",
]);

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  const type: EmailOtpType | null =
    rawType !== null && VERIFIABLE_OTP_TYPES.has(rawType as EmailOtpType) ? (rawType as EmailOtpType) : null;

  if (!tokenHash || !type) {
    const invalid = new URL("/login", request.url);
    invalid.searchParams.set("auth", "confirm-invalid");
    return redirectWithoutCaching(invalid);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    // The token hash is never logged or echoed back to the browser.
    const failed = new URL("/login", request.url);
    failed.searchParams.set("auth", "confirm-failed");
    return redirectWithoutCaching(failed);
  }

  const fallback = type === "recovery" ? "/auth/reset-password" : "/dashboard";
  const target = new URL(getSafeRedirect(next, fallback), request.url);
  return redirectWithoutCaching(target);
}
