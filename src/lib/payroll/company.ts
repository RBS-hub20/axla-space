import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

export interface PayrollCompany {
  owner_id: string;
  business_name: string;
  rdo_code: string | null;
  min_wage: number;
  tin: string | null;
  created_at: string;
}

export async function getPayrollCompany(ownerId: string): Promise<PayrollCompany | null> {
  const { data } = await supabaseAdmin.from("payroll_companies").select("*").eq("owner_id", ownerId).maybeSingle();
  return (data as PayrollCompany | null) ?? null;
}
