import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildEnforcedCsp } from "@/lib/security/csp";

export async function middleware(request: NextRequest) {
  // WP4 (audit-r1, PLN-002): enforced CSP with a per-request nonce. Next.js
  // reads the x-nonce request header and stamps its bootstrap scripts with the
  // same nonce (layout also reads it, which opts routes into dynamic
  // rendering so the nonce is always fresh).
  const nonce = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const csp = buildEnforcedCsp({
    isDevelopment: process.env.NODE_ENV === "development",
    nonce,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  // Next reads CSP from the forwarded request to nonce its framework and inline
  // scripts. A response-only policy does not authorize those bootstrap scripts.
  requestHeaders.set("Content-Security-Policy", csp);
  const response = await updateSession(request, requestHeaders);
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
