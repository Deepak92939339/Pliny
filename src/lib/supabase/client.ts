import { createBrowserClient } from "@supabase/ssr";

function getSupabaseBrowserEnv() {
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

export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseBrowserEnv();

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    // WP4 (audit-r1, PLN-001): Secure + SameSite=Lax in production. The
    // browser client must be able to READ the session cookie (it shares the
    // auth session with the server), so HttpOnly is intentionally not set —
    // the enforced CSP (WP4) is the primary XSS mitigation. See
    // docs/security-and-privacy.md.
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      ...(process.env.NODE_ENV === "production" ? { secure: true } : {}),
    },
  });
}
