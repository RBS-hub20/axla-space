import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export interface InvoiceSettings {
  id: string;
  user_id: string;
  prefix: string;
  next_number: number;
  default_terms: string | null;
  default_notes: string | null;
  logo_url: string | null;
}

export async function getOrCreateInvoiceSettings(userId: string): Promise<InvoiceSettings | null> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("invoice_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    logError("getOrCreateInvoiceSettings: fetch failed", fetchError);
    return null;
  }
  if (existing) return existing as InvoiceSettings;

  const { data: created, error: insertError } = await supabaseAdmin
    .from("invoice_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (insertError) {
    logError("getOrCreateInvoiceSettings: insert failed", insertError);
    return null;
  }
  return created as InvoiceSettings;
}

/** Formats "{PREFIX}-{YEAR}-{NUM}" with the number zero-padded to 3 digits (e.g. INV-2026-001). */
export function formatInvoiceNumber(prefix: string, year: number, num: number): string {
  return `${prefix}-${year}-${String(num).padStart(3, "0")}`;
}

/** Atomically claims the next invoice number for this user and advances the counter. */
export async function claimNextInvoiceNumber(userId: string): Promise<string | null> {
  const settings = await getOrCreateInvoiceSettings(userId);
  if (!settings) return null;

  const year = new Date().getFullYear();
  const invoiceNumber = formatInvoiceNumber(settings.prefix, year, settings.next_number);

  const { error } = await supabaseAdmin
    .from("invoice_settings")
    .update({ next_number: settings.next_number + 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) logError("claimNextInvoiceNumber: increment failed (non-fatal, number still valid)", error);

  return invoiceNumber;
}
