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

let warnedAboutUrl = false;

/**
 * Reduce the configured URL to the project origin.
 *
 * supabase-js appends `/rest/v1` itself. The Supabase dashboard shows the REST
 * endpoint next to the project URL, and pasting that one instead produces
 * `.../rest/v1//rest/v1/templates`, which the API rejects with the unhelpful
 * "Invalid path specified in request URL". Normalising here costs three lines
 * and removes a whole class of setup failure.
 */
export function projectUrl(): string {
  const raw = required("NEXT_PUBLIC_SUPABASE_URL").trim();
  const normalised = raw.replace(/\/+$/, "").replace(/\/rest\/v1$/, "").replace(/\/+$/, "");

  if (normalised !== raw && !warnedAboutUrl) {
    warnedAboutUrl = true;
    console.warn(
      `NEXT_PUBLIC_SUPABASE_URL was "${raw}"; using "${normalised}". ` +
        `Set it to the project URL only, without a path or trailing slash.`,
    );
  }
  return normalised;
}

export function supabaseRead(): SupabaseClient {
  return createClient(projectUrl(), required("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false },
  });
}

/** Server only. Bypasses row level security. Never import into a client component. */
export function supabaseWrite(): SupabaseClient {
  return createClient(projectUrl(), required("SUPABASE_SERVICE_ROLE_KEY"), {
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
