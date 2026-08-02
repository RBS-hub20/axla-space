// Deliberately NOT "server-only" — the same shape is rendered directly in
// the client dashboard and the public /c/[token] page (payroll_runs.
// payment_proofs jsonb), same reasoning as sahod.ts.

export type PaymentProofStatus = "unpaid" | "paid" | "confirmed";

export interface PaymentProof {
  status: PaymentProofStatus;
  amount: number | null;
  gcashRef: string | null;
  /** Storage path in the private payroll-receipts bucket, not a public URL — resolved to a signed URL server-side when actually displayed. */
  receiptPath: string | null;
  /** e.g. "Cash" — set when paid without a GCash receipt via the quick "Mark as Paid" action. */
  note: string | null;
  paidAt: string | null;
  paidByOwner: string | null;
  confirmedAt: string | null;
  /** Storage path, same private-bucket convention as receiptPath. */
  confirmedSelfiePath: string | null;
  /** Ephemeral — attached by GET /api/payroll/runs and the single-proof GET route as short-lived signed URLs, never persisted. */
  receiptUrl?: string | null;
  confirmedSelfieUrl?: string | null;
}

export const UNPAID_PROOF: PaymentProof = {
  status: "unpaid",
  amount: null,
  gcashRef: null,
  receiptPath: null,
  note: null,
  paidAt: null,
  paidByOwner: null,
  confirmedAt: null,
  confirmedSelfiePath: null,
};

/** payment_proofs is a jsonb map keyed by staffId — every row not yet acted on simply has no key at all, so this fills in the "unpaid" default rather than making every call site null-check. */
export function getPaymentProof(paymentProofs: Record<string, Partial<PaymentProof>> | null | undefined, staffId: string): PaymentProof {
  const raw = paymentProofs?.[staffId];
  if (!raw) return UNPAID_PROOF;
  return { ...UNPAID_PROOF, ...raw };
}
