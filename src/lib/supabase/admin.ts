import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = Boolean(supabaseUrl && serviceRoleKey);

/**
 * Service-role Supabase client — bypasses row-level security. Only ever
 * import this from server-only code (API routes, server components), never
 * from a "use client" file. The `server-only` import above makes any
 * accidental client-side import fail the build instead of leaking the key.
 */
export const supabaseAdmin = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  serviceRoleKey || "placeholder-service-role-key",
  { auth: { persistSession: false } },
);

export interface WaitlistRow {
  id: string;
  email: string;
  bir_hate_level: number;
  created_at: string;
}

export interface ChatMessageRow {
  id: string;
  ip: string;
  message: string;
  created_at: string;
}
