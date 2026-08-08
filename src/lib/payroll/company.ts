import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PayrollCompany {
  owner_id: string;
  business_name: string;
  rdo_code: string | null;
  min_wage: number;
  tin: string | null;
  created_at: string;
  /** Raw storage path in the `payroll-logos` bucket, never a URL — resolved to a signed URL at read time, see GET /api/payroll/company. */
  logo_url: string | null;
}

export async function getPayrollCompany(ownerId: string): Promise<PayrollCompany | null> {
  const { data } = await supabaseAdmin.from("payroll_companies").select("*").eq("owner_id", ownerId).maybeSingle();
  return (data as PayrollCompany | null) ?? null;
}
