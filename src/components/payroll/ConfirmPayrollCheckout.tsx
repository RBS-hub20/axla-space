"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

const CHECKOUT_STORAGE_KEY = "axla_payroll_checkout";

type State = "confirming" | "success" | "error";

export function ConfirmPayrollCheckout() {
  const router = useRouter();
  const [state, setState] = useState<State>("confirming");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
      if (!raw) {
        setState("error");
        setError("We couldn't find your checkout session — please contact hello@axla.space if you were charged.");
        return;
      }
      let checkoutSessionId: string | undefined;
      try {
        ({ checkoutSessionId } = JSON.parse(raw));
      } catch {
        // fall through — checkoutSessionId stays undefined
      }
      if (!checkoutSessionId) {
        setState("error");
        setError("We couldn't find your checkout session — please contact hello@axla.space if you were charged.");
        return;
      }

      try {
        const res = await fetch("/api/payroll/checkout/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkoutSessionId }),
        });
        const data = await res.json();
        if (!res.ok || !data.paid) {
          setState("error");
          setError(data.error || "Payment not yet confirmed — please wait a moment and refresh.");
          return;
        }
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        setState("success");
        setTimeout(() => {
          router.replace("/payroll/app");
          router.refresh();
        }, 1500);
      } catch {
        setState("error");
        setError("Network error confirming payment — please refresh to try again.");
      }
    })();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F1A] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.02] p-8 text-center">
        {state === "confirming" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#00FF88]" />
            <p className="mt-4 text-sm font-semibold text-white">Confirming your payment...</p>
            <p className="mt-1 text-xs text-slate-500">Sandali lang, hindi na kailangan i-refresh.</p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-[#00FF88]" />
            <p className="mt-4 text-sm font-semibold text-white">Payment confirmed! Loading your dashboard...</p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-4 text-sm font-semibold text-white">{error}</p>
            <a
              href="/payroll"
              className="mt-5 inline-block rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#22C55E]"
            >
              Back to Axla Payroll
            </a>
          </>
        )}
      </div>
    </div>
  );
}
