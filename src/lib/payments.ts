import "server-only";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;

export const isPayMongoConfigured = Boolean(PAYMONGO_SECRET_KEY);
export const isXenditConfigured = Boolean(XENDIT_SECRET_KEY);

function paymongoAuthHeader(): string {
  return `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`;
}

// qrph MUST be first — it's the only method currently live on the PayMongo
// account (gcash-direct/card/paymaya/grab_pay are pending DTI approval as of
// 2026-07-24). Shared by every checkout-creating function below so a newly
// approved method only needs updating in one place.
export const PAYMONGO_ACTIVE_PAYMENT_METHODS = ["qrph", "gcash", "card", "paymaya", "grab_pay", "billease"];

export interface CheckoutParams {
  email: string;
  plan: "pro" | "business";
  billingCycle: "monthly" | "yearly";
  /** Amount in whole PHP pesos (not centavos) — helpers convert internally where each provider needs it. */
  amount: number;
}

export interface CheckoutResult {
  url: string | null;
  error?: string;
}

/**
 * Creates a PayMongo Payment Link for a plan upgrade. Returns `{ url: null, error }`
 * instead of throwing when PAYMONGO_SECRET_KEY isn't set or the API call fails,
 * so callers can show a friendly "payments aren't set up yet" message.
 */
export async function createPayMongoCheckoutLink(params: CheckoutParams): Promise<CheckoutResult> {
  if (!PAYMONGO_SECRET_KEY) {
    return { url: null, error: "PayMongo is not configured." };
  }

  try {
    const res = await fetch("https://api.paymongo.com/v1/links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            amount: Math.round(params.amount * 100), // centavos
            description: `Axla TaxLaya ${params.plan} plan (${params.billingCycle})`,
            remarks: params.email,
          },
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { url: null, error: json?.errors?.[0]?.detail || "PayMongo request failed." };
    }
    return { url: json?.data?.attributes?.checkout_url ?? null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "Network error." };
  }
}

export interface CheckoutSessionParams extends CheckoutParams {
  description: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Creates a PayMongo Checkout Session — a separate API from the Payment
 * Links used by createPayMongoCheckoutLink() above. Links don't support a
 * custom success_url; Checkout Sessions do, which is the only reason this
 * exists alongside it rather than reusing it — same account, same secret
 * key, same resulting subscriptions-table activation via the shared
 * /api/webhooks/paymongo handler (which now also accepts this API's
 * checkout_session.payment.paid event).
 */
export async function createPayMongoCheckoutSession(params: CheckoutSessionParams): Promise<CheckoutResult> {
  if (!PAYMONGO_SECRET_KEY) {
    return { url: null, error: "PayMongo is not configured." };
  }

  try {
    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: paymongoAuthHeader(),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: `Axla ${params.plan === "business" ? "Business" : "PRO"}`,
                amount: Math.round(params.amount * 100),
                currency: "PHP",
                quantity: 1,
                description: params.description,
              },
            ],
            payment_method_types: PAYMONGO_ACTIVE_PAYMENT_METHODS,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            send_email_receipt: true,
            show_line_items: true,
            billing: { email: params.email },
          },
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { url: null, error: json?.errors?.[0]?.detail || "PayMongo request failed." };
    }
    return { url: json?.data?.attributes?.checkout_url ?? null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "Network error." };
  }
}

export interface OneTimeCheckoutParams {
  /** Whole PHP pesos, not centavos — converted internally, same convention as CheckoutParams. */
  amountPesos: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Optional — omitted entirely for true anonymous one-time purchases
   * (Negosyo Tracker), which is what keeps them invisible to
   * /api/webhooks/paymongo's email-presence check and unable to trigger its
   * subscriptions upsert. Axla Payroll's checkout (src/app/api/payroll/checkout)
   * DOES pass one (a synthetic axla-payroll+{timestamp}@axla.space, not a
   * real account address) specifically so that webhook's dedicated early
   * payroll branch can pick the payment up for admin-dashboard visibility —
   * that branch matches on the "axla-payroll+" prefix and writes
   * payroll_starter/business/enterprise, never "pro"/"business", so it can't
   * be confused with a real TaxLaya subscription either way.
   */
  email?: string;
}

export interface OneTimeCheckoutResult {
  url: string | null;
  checkoutSessionId: string | null;
  error?: string;
}

/**
 * Same PayMongo account, same secret key, same Checkout Sessions API as
 * createPayMongoCheckoutSession above — this variant exists for one-time
 * product purchases that don't fit that function's plan/billingCycle-shaped
 * params. Callers that don't pass `email` (Negosyo Tracker) verify payment
 * via getPayMongoCheckoutSessionStatus() below rather than relying on the
 * shared webhook at all, so an anonymous buyer can never be silently
 * upgraded to anything. Callers that DO pass `email` (Axla Payroll) still
 * verify the same way for real access control — the webhook pickup is
 * purely for admin reporting, see OneTimeCheckoutParams.email above.
 */
export async function createPayMongoOneTimeCheckout(params: OneTimeCheckoutParams): Promise<OneTimeCheckoutResult> {
  if (!PAYMONGO_SECRET_KEY) {
    return { url: null, checkoutSessionId: null, error: "PayMongo is not configured." };
  }

  try {
    const res = await fetch("https://api.paymongo.com/v1/checkout_sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: paymongoAuthHeader(),
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [
              {
                name: params.description,
                amount: Math.round(params.amountPesos * 100),
                currency: "PHP",
                quantity: 1,
                description: params.description,
              },
            ],
            payment_method_types: PAYMONGO_ACTIVE_PAYMENT_METHODS,
            success_url: params.successUrl,
            cancel_url: params.cancelUrl,
            // Always off, even when `email` is set — for Payroll that email
            // is a synthetic per-transaction placeholder for the webhook to
            // key on, not a real inbox anyone reads a receipt from.
            send_email_receipt: false,
            show_line_items: true,
            ...(params.email ? { billing: { email: params.email } } : {}),
          },
        },
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { url: null, checkoutSessionId: null, error: json?.errors?.[0]?.detail || "PayMongo request failed." };
    }
    return {
      url: json?.data?.attributes?.checkout_url ?? null,
      checkoutSessionId: json?.data?.id ?? null,
    };
  } catch (err) {
    return { url: null, checkoutSessionId: null, error: err instanceof Error ? err.message : "Network error." };
  }
}

export interface CheckoutSessionStatus {
  paid: boolean;
  paymentId: string | null;
  paymentMethod: string | null;
  /** The checkout session's own line_items[0].description, as set at creation time (see createPayMongoOneTimeCheckout) — PayMongo's own server-side record of what was actually sold, not anything the client can influence at confirm time. */
  description: string | null;
  /** Line items total, in whole pesos (not centavos). */
  amountPesos: number;
  error?: string;
}

/**
 * Server-to-server GET against PayMongo's own record of the checkout
 * session — the only trustworthy way to confirm a one-time purchase was
 * actually paid, since there's no webhook wired up for this product (see
 * createPayMongoOneTimeCheckout's docstring). A session counts as paid when
 * either its payment_intent has succeeded or its payments[] array contains
 * an entry with status "paid" — PayMongo's own docs list both as valid
 * signals and real payloads have been observed favoring one or the other
 * depending on payment method.
 */
export async function getPayMongoCheckoutSessionStatus(checkoutSessionId: string): Promise<CheckoutSessionStatus> {
  if (!PAYMONGO_SECRET_KEY) {
    return { paid: false, paymentId: null, paymentMethod: null, description: null, amountPesos: 0, error: "PayMongo is not configured." };
  }

  try {
    const res = await fetch(`https://api.paymongo.com/v1/checkout_sessions/${checkoutSessionId}`, {
      headers: { Authorization: paymongoAuthHeader() },
    });
    const json = await res.json();
    if (!res.ok) {
      return {
        paid: false,
        paymentId: null,
        paymentMethod: null,
        description: null,
        amountPesos: 0,
        error: json?.errors?.[0]?.detail || "PayMongo request failed.",
      };
    }

    const attrs = json?.data?.attributes as Record<string, unknown> | undefined;
    const payments = attrs?.payments as Array<{ data?: { id?: string; attributes?: Record<string, unknown> } }> | undefined;
    const paidPayment = payments?.find((p) => p.data?.attributes?.status === "paid")?.data;
    const paymentIntent = attrs?.payment_intent as { attributes?: { status?: string } } | undefined;
    const intentSucceeded = paymentIntent?.attributes?.status === "succeeded";

    const source = paidPayment?.attributes?.source as Record<string, unknown> | undefined;
    const sourceType = typeof source?.type === "string" ? source.type.toLowerCase() : "";
    const paymentMethod = sourceType.includes("gcash")
      ? "gcash"
      : sourceType.includes("paymaya") || sourceType.includes("maya")
        ? "maya"
        : sourceType.includes("card")
          ? "card"
          : sourceType || null;

    const lineItems = attrs?.line_items as Array<{ amount?: number; description?: string }> | undefined;
    const amountPesos = Array.isArray(lineItems)
      ? Math.round(lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0) / 100)
      : 0;
    const description = (lineItems?.[0]?.description as string | undefined) ?? null;

    return {
      paid: Boolean(paidPayment) || intentSucceeded,
      paymentId: (paidPayment?.id as string | undefined) ?? null,
      paymentMethod,
      description,
      amountPesos,
    };
  } catch (err) {
    return {
      paid: false,
      paymentId: null,
      paymentMethod: null,
      description: null,
      amountPesos: 0,
      error: err instanceof Error ? err.message : "Network error.",
    };
  }
}

/**
 * Creates a Xendit Invoice for a plan upgrade. Same fail-soft contract as
 * createPayMongoCheckoutLink: never throws, returns an error string instead.
 */
export async function createXenditInvoice(params: CheckoutParams): Promise<CheckoutResult> {
  if (!XENDIT_SECRET_KEY) {
    return { url: null, error: "Xendit is not configured." };
  }

  try {
    const res = await fetch("https://api.xendit.co/v2/invoices", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${XENDIT_SECRET_KEY}:`).toString("base64")}`,
      },
      body: JSON.stringify({
        external_id: `axla-${params.plan}-${params.email}-${Date.now()}`,
        amount: params.amount,
        currency: "PHP",
        payer_email: params.email,
        description: `Axla TaxLaya ${params.plan} plan (${params.billingCycle})`,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      return { url: null, error: json?.message || "Xendit request failed." };
    }
    return { url: json?.invoice_url ?? null };
  } catch (err) {
    return { url: null, error: err instanceof Error ? err.message : "Network error." };
  }
}
