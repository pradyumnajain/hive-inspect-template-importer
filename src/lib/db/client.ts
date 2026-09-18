import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two clients on purpose.
 *
 * Reads go through the anon key, which row level security restricts to
 * SELECT. Writes go through the service role key, which is server-only and
 * never reaches the browser. There is no login in this assignment, so this is
 * the cheapest way to keep write access off the client.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project settings.`,
    );
  }
  return value;
}

export function supabaseRead(): SupabaseClient {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
}

/** Server only. Bypasses row level security. Never import into a client component. */
export function supabaseWrite(): SupabaseClient {
  return createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

/** True when the app has enough configuration to talk to a database at all. */
export function isConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
