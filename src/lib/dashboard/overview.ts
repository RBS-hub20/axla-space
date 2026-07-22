import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import { getCurrentQuarter } from "@/lib/dashboard/quarter";
import { getQuarterDeadline, type TaxType } from "@/lib/tax-calculator";

export interface OverviewStats {
  totalIncomeThisQuarter: number;
  totalExpensesThisQuarter: number;
  taxDueThisQuarter: number;
  receiptsUploaded: number;
  hasPendingFiling: boolean;
  nextDeadline: { formType: string; dueDate: string } | null;
  /**
   * 0-100, computed from real signals only (never a decorative fixed
   * number): starts at 100, docked for a pending draft filing, for having
   * never uploaded a receipt, and for a pending filing sitting inside the
   * final 14 days before its deadline. Clamped to [0, 100].
   */
  taxHealthScore: number;
}

/**
 * Aggregate stats for the dashboard overview page. Fails to safe zeros,
 * never throws. `businessId` filters to one business's rows; pass null/
 * undefined for the consolidated "All Businesses" view (sums everything
 * regardless of which business it's tagged with, including untagged rows
 * from before multi-business support existed).
 */
export async function getOverviewStats(userId: string, taxType: TaxType, businessId?: string | null): Promise<OverviewStats> {
  const { quarter, year } = getCurrentQuarter();

  let calcsQuery = supabaseAdmin
    .from("tax_calculations")
    .select("income, expenses, tax_due")
    .eq("user_id", userId)
    .eq("quarter", quarter)
    .eq("year", year);
  let receiptsQuery = supabaseAdmin.from("receipts").select("id", { count: "exact", head: true }).eq("user_id", userId);
  let formsQuery = supabaseAdmin.from("bir_forms").select("form_type, status").eq("user_id", userId).eq("status", "draft");

  if (businessId) {
    calcsQuery = calcsQuery.eq("business_id", businessId);
    receiptsQuery = receiptsQuery.eq("business_id", businessId);
    formsQuery = formsQuery.eq("business_id", businessId);
  }

  const [calcsRes, receiptsRes, formsRes] = await Promise.all([calcsQuery, receiptsQuery, formsQuery]);

  if (calcsRes.error) logError("getOverviewStats: tax_calculations query failed", calcsRes.error);
  if (receiptsRes.error) logError("getOverviewStats: receipts count failed", receiptsRes.error);
  if (formsRes.error) logError("getOverviewStats: bir_forms query failed", formsRes.error);

  const calcs = calcsRes.data ?? [];
  const totalIncomeThisQuarter = calcs.reduce((sum, row) => sum + Number(row.income), 0);
  const totalExpensesThisQuarter = calcs.reduce((sum, row) => sum + Number(row.expenses), 0);
  const taxDueThisQuarter = calcs.reduce((sum, row) => sum + Number(row.tax_due), 0);

  const hasPendingFiling = (formsRes.data?.length ?? 0) > 0;

  const formType = taxType === "3%" ? "2551Q" : "1701Q";
  const dueDate = getQuarterDeadline(formType, quarter, year);
  const receiptsUploaded = receiptsRes.count ?? 0;

  const daysUntilDeadline = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  let taxHealthScore = 100;
  if (hasPendingFiling) taxHealthScore -= 25;
  if (receiptsUploaded === 0) taxHealthScore -= 15;
  if (hasPendingFiling && daysUntilDeadline < 14) taxHealthScore -= 15;
  taxHealthScore = Math.max(0, Math.min(100, taxHealthScore));

  return {
    totalIncomeThisQuarter,
    totalExpensesThisQuarter,
    taxDueThisQuarter,
    receiptsUploaded,
    hasPendingFiling,
    nextDeadline: { formType, dueDate: dueDate.toISOString() },
    taxHealthScore,
  };
}

export interface MonthlyFinancial {
  key: string;
  label: string;
  income: number;
  expenses: number;
}

export interface RevenueTimeline {
  months: MonthlyFinancial[];
  hasData: boolean;
  /** null when there's no prior-period baseline to compare against — never a fabricated percentage. */
  incomeTrendPct: number | null;
  expensesTrendPct: number | null;
}

function trendPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Last `months` calendar months of income/expenses from real GCash-uploaded
 * transactions, zero-filled so the chart always has a continuous axis even
 * for months with no rows. Trend percentages compare the last two buckets
 * and are left null (never mocked) when there's no positive prior-period
 * value to divide by.
 */
export async function getRevenueTimeline(
  userId: string,
  businessId?: string | null,
  months = 6,
): Promise<RevenueTimeline> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));

  let query = supabaseAdmin
    .from("transactions")
    .select("transaction_date, amount, type")
    .eq("user_id", userId)
    .gte("transaction_date", start.toISOString().slice(0, 10));

  if (businessId) query = query.eq("business_id", businessId);

  const { data, error } = await query;
  if (error) logError("getRevenueTimeline: transactions query failed", error);

  const buckets = new Map<string, MonthlyFinancial>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    buckets.set(key, {
      key,
      label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
      income: 0,
      expenses: 0,
    });
  }

  for (const row of data ?? []) {
    const key = String(row.transaction_date).slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (row.type === "income") bucket.income += Number(row.amount);
    else bucket.expenses += Number(row.amount);
  }

  const monthsArr = Array.from(buckets.values());
  const hasData = monthsArr.some((m) => m.income > 0 || m.expenses > 0);
  const last = monthsArr[monthsArr.length - 1];
  const prev = monthsArr[monthsArr.length - 2];

  return {
    months: monthsArr,
    hasData,
    incomeTrendPct: last && prev ? trendPct(last.income, prev.income) : null,
    expensesTrendPct: last && prev ? trendPct(last.expenses, prev.expenses) : null,
  };
}
