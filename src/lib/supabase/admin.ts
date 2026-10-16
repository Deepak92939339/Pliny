import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Server-only and used solely by the maintenance job
 * (src/app/api/cron/maintenance), which has no user session. Request handlers must keep
 * using the per-user client so Row Level Security and Storage policies stay in force.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createSupabaseClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
