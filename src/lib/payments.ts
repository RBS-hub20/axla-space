import "server-only";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;

export const isPayMongoConfigured = Boolean(PAYMONGO_SECRET_KEY);
export const isXenditConfigured = Boolean(XENDIT_SECRET_KEY);

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
        Authorization: `Basic ${Buffer.from(`${PAYMONGO_SECRET_KEY}:`).toString("base64")}`,
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
            payment_method_types: ["gcash", "card", "paymaya", "grab_pay"],
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
