import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import type { TaxType } from "@/lib/tax-calculator";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  tin_number: string | null;
  address: string | null;
  tax_type: TaxType;
  rdo_code: string | null;
  created_at: string;
  updated_at: string;
}

/** Fetches the profile row for a user, creating a default one on first visit. */
export async function getOrCreateProfile(userId: string, email: string, defaultName: string): Promise<Profile | null> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    logError("getOrCreateProfile: fetch failed", fetchError);
    return null;
  }

  if (existing) return existing as Profile;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("profiles")
    .insert({ id: userId, email, full_name: defaultName })
    .select("*")
    .single();

  if (insertError) {
    logError("getOrCreateProfile: insert failed", insertError);
    return null;
  }

  return created as Profile;
}

export interface ProfileUpdate {
  full_name?: string;
  business_name?: string;
  tin_number?: string;
  address?: string;
  tax_type?: TaxType;
  rdo_code?: string;
}

export interface UpdateProfileResult {
  profile: Profile | null;
  error: PostgrestError | null;
}

/**
 * Returns the real Supabase error alongside the result (instead of just
 * null on failure) so the API route can surface the actual cause instead
 * of a generic message with no way to diagnose it further.
 */
export async function updateProfile(userId: string, updates: ProfileUpdate): Promise<UpdateProfileResult> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("*")
    .single();

  if (error) {
    logError("updateProfile: update failed", error);
    return { profile: null, error };
  }

  return { profile: data as Profile, error: null };
}
