import "server-only";
import { createClient } from "@supabase/supabase-js";

// .trim() guards against a stray trailing newline/space in .env(.local) —
// see the matching comment in src/lib/supabase/client.ts.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

export const isSupabaseAdminConfigured = Boolean(supabaseUrl && serviceRoleKey);

if (process.env.NODE_ENV !== "production") {
  if (!serviceRoleKey || serviceRoleKey === "your-service-role-key") {
    console.error(
      "[supabase/admin] SUPABASE_SERVICE_ROLE_KEY is missing or still the placeholder value from .env.example. " +
        "The admin dashboard (waitlist, chat feed, stats) will fail until this is set to your real service_role key, then restart `npm run dev`.",
    );
  } else {
    console.log(`[supabase/admin] url=${supabaseUrl ?? "(unset)"} serviceRoleKeyLength=${serviceRoleKey.length}`);
  }
}

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
  // Added by migrations/004_waitlist_gate_and_admin_role.sql — optional so
  // this type still matches rows fetched before that migration ran.
  name?: string | null;
  business_name?: string | null;
  status?: "pending" | "approved" | "rejected" | null;
  // No `city`/`location` column exists on the live waitlist table yet — these
  // are declared so UserMap's real-data code path (src/components/admin/UserMap.tsx)
  // type-checks and lights up automatically the moment such a column is added,
  // without another schema/type change.
  city?: string | null;
  location?: string | null;
}

export interface ChatMessageRow {
  id: string;
  ip: string;
  message: string;
  created_at: string;
}
