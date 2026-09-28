import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function getSupabaseServerEnv() {
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

export async function createClient() {
  const cookieStore = await cookies();
  const { supabaseUrl, supabaseAnonKey } = getSupabaseServerEnv();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    // WP4 (audit-r1, PLN-001): Secure + SameSite=Lax in production; HttpOnly
    // reasoning in docs/security-and-privacy.md and client.ts.
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      ...(process.env.NODE_ENV === "production" ? { secure: true } : {}),
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components can read cookies, while Server Actions and Middleware can write them.
        }
      },
    },
  });
}
