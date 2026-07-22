import "server-only";
import { PLAN_PRICING, type PaidPlan } from "@/lib/plans";

export interface SubscriptionSummary {
  plan: string;
  status: string;
  lastPayment: string | null;
  nextBilling: string | null;
}

export interface PaymentsStats {
  totalRevenue: number;
  mrr: number;
  activePaidUsers: number;
  failedPayments: number;
}

export interface RevenueDay {
  date: string;
  amount: number;
}

export interface RecentPayment {
  id: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  paymentMethod: string | null;
  plan: string | null;
  createdAt: string;
}

export interface PaymentsPayload {
  stats: PaymentsStats;
  revenueByDay: RevenueDay[];
  recentPayments: RecentPayment[];
  /** Full payment history (up to the query cap), for the Subscribers tab — recentPayments is just the top 10 for the dashboard feed widget. */
  payments: RecentPayment[];
  subscriptionsByEmail: Record<string, SubscriptionSummary>;
  isMock: boolean;
}

export interface RawPaymentRow {
  id: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  payment_method: string | null;
  plan: string | null;
  created_at: string;
}

export interface RawSubscriptionRow {
  email: string;
  plan: string;
  status: string;
  amount: number;
  billing_cycle: string | null;
  current_period_end: string | null;
}


function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Aggregates real payments/subscriptions rows into the shape the admin dashboard renders. */
export function aggregatePayments(payments: RawPaymentRow[], subscriptions: RawSubscriptionRow[]): PaymentsPayload {
  const totalRevenue = payments.filter((p) => p.status === "paid").reduce((sum, p) => sum + p.amount, 0);

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const mrr = Math.round(
    activeSubs.reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? s.amount / 12 : s.amount), 0),
  );
  const failedPayments = payments.filter((p) => p.status === "failed").length;

  const today = new Date();
  const revenueByDay: RevenueDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const dayKey = day.toDateString();
    const amount = payments
      .filter((p) => p.status === "paid" && new Date(p.created_at).toDateString() === dayKey)
      .reduce((sum, p) => sum + p.amount, 0);
    revenueByDay.push({ date: dayLabel(day), amount });
  }

  const allPayments: RecentPayment[] = payments.map((p) => ({
    id: p.id,
    email: p.email,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    provider: p.provider,
    paymentMethod: p.payment_method,
    plan: p.plan,
    createdAt: p.created_at,
  }));
  const recentPayments = allPayments.slice(0, 10);

  const lastPaymentByEmail = new Map<string, string>();
  for (const p of payments) {
    if (p.status !== "paid") continue;
    const key = p.email.toLowerCase();
    const existing = lastPaymentByEmail.get(key);
    if (!existing || new Date(p.created_at) > new Date(existing)) {
      lastPaymentByEmail.set(key, p.created_at);
    }
  }

  const subscriptionsByEmail: Record<string, SubscriptionSummary> = {};
  for (const s of subscriptions) {
    const key = s.email.toLowerCase();
    subscriptionsByEmail[key] = {
      plan: s.plan,
      status: s.status,
      lastPayment: lastPaymentByEmail.get(key) ?? null,
      nextBilling: s.current_period_end,
    };
  }

  return {
    stats: { totalRevenue, mrr, activePaidUsers: activeSubs.length, failedPayments },
    revenueByDay,
    recentPayments,
    payments: allPayments,
    subscriptionsByEmail,
    isMock: false,
  };
}

/**
 * Deterministic sample data so the Revenue KPIs/chart/feed never render as a
 * wall of zeros before any real PayMongo/Xendit traffic exists — surfaced to
 * the admin UI with `isMock: true` so it's clearly labeled demo data, not
 * live revenue.
 */
export function buildMockPaymentsPayload(): PaymentsPayload {
  const today = new Date();

  const revenueByDay: RevenueDay[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const wave = Math.sin(i / 4) * 350 + 900 + (i % 7 === 0 ? 600 : 0);
    revenueByDay.push({ date: dayLabel(day), amount: Math.max(0, Math.round(wave)) });
  }
  const totalRevenue = revenueByDay.reduce((sum, d) => sum + d.amount, 0);

  const mockPayments: Array<{
    email: string;
    provider: "paymongo" | "xendit";
    method: "gcash" | "maya" | "card";
    status: "paid" | "failed";
    daysAgo: number;
    plan: "pro" | "business";
  }> = [
    { email: "juan.delacruz@gmail.com", provider: "paymongo", method: "gcash", status: "paid", daysAgo: 0, plan: "pro" },
    { email: "maria.santos@gmail.com", provider: "xendit", method: "maya", status: "paid", daysAgo: 1, plan: "business" },
    { email: "pedro.reyes@gmail.com", provider: "paymongo", method: "card", status: "paid", daysAgo: 2, plan: "pro" },
    { email: "ana.garcia@gmail.com", provider: "paymongo", method: "gcash", status: "failed", daysAgo: 3, plan: "pro" },
    { email: "jose.rizal@gmail.com", provider: "xendit", method: "card", status: "paid", daysAgo: 4, plan: "business" },
    { email: "carla.aquino@gmail.com", provider: "xendit", method: "maya", status: "paid", daysAgo: 6, plan: "pro" },
  ];

  const recentPayments: RecentPayment[] = mockPayments.map((p, i) => ({
    id: `mock-${i}`,
    email: p.email,
    amount: PLAN_PRICING[p.plan].monthly,
    currency: "PHP",
    status: p.status,
    provider: p.provider,
    paymentMethod: p.method,
    plan: p.plan,
    createdAt: new Date(today.getTime() - p.daysAgo * 86_400_000).toISOString(),
  }));

  const subscriptionsByEmail: Record<string, SubscriptionSummary> = {};
  for (const p of mockPayments) {
    if (p.status !== "paid") continue;
    subscriptionsByEmail[p.email.toLowerCase()] = {
      plan: p.plan,
      status: "active",
      lastPayment: new Date(today.getTime() - p.daysAgo * 86_400_000).toISOString(),
      nextBilling: new Date(today.getTime() + (30 - p.daysAgo) * 86_400_000).toISOString(),
    };
  }

  const activePaidUsers = Object.keys(subscriptionsByEmail).length;
  const failedPayments = mockPayments.filter((p) => p.status === "failed").length;
  const mrr = Object.values(subscriptionsByEmail).reduce(
    (sum, s) => sum + (PLAN_PRICING[s.plan as PaidPlan]?.monthly ?? 0),
    0,
  );

  return {
    stats: { totalRevenue, mrr, activePaidUsers, failedPayments },
    revenueByDay,
    recentPayments,
    payments: recentPayments,
    subscriptionsByEmail,
    isMock: true,
  };
}
