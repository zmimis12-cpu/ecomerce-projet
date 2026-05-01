/**
 * Supabase Admin Client
 * Uses the SERVICE ROLE KEY — bypasses RLS entirely.
 * ONLY use in:
 *   - Server Actions that require elevated permissions
 *   - Background jobs / cron routes
 *   - Migration scripts
 *
 * NEVER expose this client to the browser.
 * NEVER import this file in any "use client" component.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable.");
}

export const supabaseAdmin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
