"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

/** Auth-aware — logged in goes straight to the dashboard, logged out goes through login first (and back to /payroll/app after), so an already-signed-in visitor never has to redo the OTP flow just to click "start". */
export function PayrollHeroCta() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);

  async function handleClick() {
    setIsChecking(true);
    try {
      const res = await fetch("/api/payroll/status", { cache: "no-store" });
      if (res.status === 401) {
        router.push(`/login?next=${encodeURIComponent("/payroll/app")}`);
        return;
      }
      router.push("/payroll/app");
    } catch {
      router.push(`/login?next=${encodeURIComponent("/payroll/app")}`);
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isChecking}
      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-black shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {isChecking && <Loader2 className="h-4 w-4 animate-spin" />}
      Gumawa ng Payroll — Libre mag browse
    </button>
  );
}
