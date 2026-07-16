import "server-only";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";

export interface WaitlistStats {
  count: number;
  avgHateLevel: number;
}

/** Real aggregate signup stats for landing-page social proof — no PII, fails to zeros. */
export async function getWaitlistStats(): Promise<WaitlistStats> {
  if (!isSupabaseAdminConfigured) {
    return { count: 0, avgHateLevel: 0 };
  }

  const { data, error } = await supabaseAdmin.from("waitlist").select("bir_hate_level");

  if (error || !data) {
    return { count: 0, avgHateLevel: 0 };
  }

  const count = data.length;
  const avgHateLevel =
    count === 0 ? 0 : data.reduce((sum, row) => sum + row.bir_hate_level, 0) / count;

  return { count, avgHateLevel };
}
