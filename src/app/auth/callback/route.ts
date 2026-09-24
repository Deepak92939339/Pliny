import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirect } from "@/lib/auth/redirects";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function redirectWithoutCaching(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const next = url.searchParams.get("next");

  const loginFallback = new URL("/login", request.url);
  if (oauthError || !code) {
    // Provider error descriptions are never surfaced or logged.
    loginFallback.searchParams.set("auth", "error");
    return redirectWithoutCaching(loginFallback);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    loginFallback.searchParams.set("auth", "error");
    return redirectWithoutCaching(loginFallback);
  }

  const target = new URL(getSafeRedirect(next, "/dashboard"), request.url);
  return redirectWithoutCaching(target);
}
