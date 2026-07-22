import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import type { Profile } from "@/lib/dashboard/profile";

export interface Business {
  id: string;
  user_id: string;
  name: string;
  tin: string | null;
  rdo_code: string | null;
  branch_code: string;
  address: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface BusinessInput {
  name: string;
  tin?: string;
  rdo_code?: string;
  branch_code?: string;
  address?: string;
}

export async function getBusinesses(userId: string): Promise<Business[]> {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("user_id", userId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    logError("getBusinesses: query failed", error);
    return [];
  }
  return (data as Business[]) ?? [];
}

export interface CreateBusinessResult {
  business: Business | null;
  error: PostgrestError | null;
}

/** First business a user creates is automatically primary — nobody should end up with zero primary businesses. */
export async function createBusiness(userId: string, input: BusinessInput): Promise<CreateBusinessResult> {
  const existing = await getBusinesses(userId);
  const isFirst = existing.length === 0;

  const { data, error } = await supabaseAdmin
    .from("businesses")
    .insert({
      user_id: userId,
      name: input.name,
      tin: input.tin || null,
      rdo_code: input.rdo_code || null,
      branch_code: input.branch_code || "000",
      address: input.address || null,
      is_primary: isFirst,
    })
    .select("*")
    .single();

  if (error) {
    logError("createBusiness: insert failed", error);
    return { business: null, error };
  }
  return { business: data as Business, error: null };
}

export interface UpdateBusinessResult {
  business: Business | null;
  error: PostgrestError | null;
}

export async function updateBusiness(
  userId: string,
  businessId: string,
  updates: Partial<BusinessInput>,
): Promise<UpdateBusinessResult> {
  const { data, error } = await supabaseAdmin
    .from("businesses")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", businessId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    logError("updateBusiness: update failed", error);
    return { business: null, error };
  }
  return { business: data as Business, error: null };
}

/**
 * Unsets is_primary on every other business for this user, then sets it on
 * the target — two sequential updates (not one), since the partial unique
 * index (`businesses_one_primary_per_user`) rejects ever having two `true`
 * rows at once, even transiently within one statement's row set.
 */
export async function setPrimaryBusiness(userId: string, businessId: string): Promise<UpdateBusinessResult> {
  const { error: unsetError } = await supabaseAdmin
    .from("businesses")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_primary", true);

  if (unsetError) {
    logError("setPrimaryBusiness: unset old primary failed", unsetError);
    return { business: null, error: unsetError };
  }

  const { data, error } = await supabaseAdmin
    .from("businesses")
    .update({ is_primary: true, updated_at: new Date().toISOString() })
    .eq("id", businessId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    logError("setPrimaryBusiness: set new primary failed", error);
    return { business: null, error };
  }
  return { business: data as Business, error: null };
}

export interface DeleteBusinessResult {
  success: boolean;
  error: PostgrestError | null;
}

/** If the deleted business was primary and others remain, promotes the oldest remaining one so the user is never left without a primary. */
export async function deleteBusiness(userId: string, businessId: string): Promise<DeleteBusinessResult> {
  const { data: target } = await supabaseAdmin
    .from("businesses")
    .select("is_primary")
    .eq("id", businessId)
    .eq("user_id", userId)
    .maybeSingle();

  const { error: deleteError } = await supabaseAdmin
    .from("businesses")
    .delete()
    .eq("id", businessId)
    .eq("user_id", userId);

  if (deleteError) {
    logError("deleteBusiness: delete failed", deleteError);
    return { success: false, error: deleteError };
  }

  if (target?.is_primary) {
    const remaining = await getBusinesses(userId);
    if (remaining.length > 0) {
      await setPrimaryBusiness(userId, remaining[0].id);
    }
  }

  return { success: true, error: null };
}

/** A business-shaped view of a business row, or a synthetic one built from profile fallback fields. */
export interface ResolvedBusiness {
  id: string | null; // null when synthesized from profile — nothing to filter tax_calculations.business_id by
  name: string;
  tin: string | null;
  rdoCode: string | null;
  branchCode: string;
  address: string | null;
  isPrimary: boolean;
  fromProfileFallback: boolean;
}

/**
 * Resolves which business's details to show/use: the explicitly requested
 * businessId if given and owned by this user, else the user's primary
 * business, else — per the requirement to keep profile fields as a
 * fallback — a synthetic "business" built from profiles.business_name/
 * tin_number/rdo_code/address so users who haven't created any real
 * businesses yet still get sensible PDF/Overview output.
 */
export async function resolveBusiness(
  userId: string,
  profile: Profile | null,
  businessId?: string | null,
): Promise<ResolvedBusiness | null> {
  if (businessId) {
    const { data, error } = await supabaseAdmin
      .from("businesses")
      .select("*")
      .eq("id", businessId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) logError("resolveBusiness: explicit lookup failed", error);
    if (data) {
      const b = data as Business;
      return {
        id: b.id,
        name: b.name,
        tin: b.tin,
        rdoCode: b.rdo_code,
        branchCode: b.branch_code,
        address: b.address,
        isPrimary: b.is_primary,
        fromProfileFallback: false,
      };
    }
  }

  const { data: primary, error: primaryError } = await supabaseAdmin
    .from("businesses")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (primaryError) logError("resolveBusiness: primary lookup failed", primaryError);
  if (primary) {
    const b = primary as Business;
    return {
      id: b.id,
      name: b.name,
      tin: b.tin,
      rdoCode: b.rdo_code,
      branchCode: b.branch_code,
      address: b.address,
      isPrimary: true,
      fromProfileFallback: false,
    };
  }

  if (!profile) return null;

  return {
    id: null,
    name: profile.business_name || profile.full_name || "Not set",
    tin: profile.tin_number,
    rdoCode: profile.rdo_code,
    branchCode: "000",
    address: profile.address,
    isPrimary: true,
    fromProfileFallback: true,
  };
}
