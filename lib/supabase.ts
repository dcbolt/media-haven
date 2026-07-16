import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side admin client. Bypasses RLS via the service-role key, so it must
 * only ever be imported from server code (server components, route handlers,
 * lib). Guest access is mediated by token resolution in lib/reservations.ts —
 * guests never get a Supabase session of their own.
 */
export function supabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // unconfigured → callers fall back to mock data
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
