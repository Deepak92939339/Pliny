import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

function getSupabaseMiddlewareEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

function isProtectedRoute(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/collection" ||
    pathname.startsWith("/collection/")
  );
}

export async function updateSession(request: NextRequest, requestHeaders?: Headers) {
  let response = requestHeaders
    ? NextResponse.next({
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request });
  const { supabaseUrl, supabaseAnonKey } = getSupabaseMiddlewareEnv();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: {
      // WP4 (audit-r1, PLN-001): Secure cookies in production. HttpOnly stays
      // off because the browser Supabase client must read the session —
      // reasoning documented in docs/security-and-privacy.md.
      path: "/",
      sameSite: "lax",
      ...(process.env.NODE_ENV === "production" ? { secure: true } : {}),
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = requestHeaders
          ? NextResponse.next({
              request: { headers: requestHeaders },
            })
          : NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute(request.nextUrl.pathname) && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectedFrom", request.nextUrl.pathname);

    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
