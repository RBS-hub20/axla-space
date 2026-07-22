"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, Mail, Lock, Users, ArrowRight, ChevronRight, Wallet, Calculator, FileCheck } from "lucide-react";
import { DashboardMockup } from "@/components/DashboardMockup";

type Step = "email" | "otp";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BENEFITS = [
  { icon: Wallet, title: "GCash auto-sync", description: "Upload your transaction history, Axla reads it automatically." },
  { icon: Calculator, title: "2551Q auto-compute", description: "Gross sales, tax due, all computed for you — no manual math." },
  { icon: FileCheck, title: "BIR-ready PDF", description: "Clean, filing-ready reference sheet in one click." },
];

function JoinPill() {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#22c55e]/30 bg-[#22c55e]/5 px-4 py-2 text-xs font-medium text-[#22c55e]">
      <Users className="h-3.5 w-3.5" />
      Join Filipinos who hate BIR paperwork
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}

/** Static TaxLaya avatar + speech bubble — reuses the same image the floating widget uses, but as inline decorative content, not the interactive widget itself (that's fully hidden on this route). */
function TaxlayaGreeting() {
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 scale-125 rounded-full bg-[#22c55e]/40 blur-xl" />
        <Image
          src="/taxlaya-avatar.png"
          alt="TaxLaya"
          width={64}
          height={64}
          className="h-11 w-11 rounded-full border-2 border-[#22c55e]/50 object-cover shadow-[0_0_20px_rgba(34,197,94,0.45)] md:h-16 md:w-16"
        />
      </div>
      <div className="mt-2 hidden max-w-[170px] rounded-2xl rounded-tr-sm border border-white/10 bg-[#0F1A25] px-3 py-2 text-center text-[11px] leading-snug text-slate-300 shadow-lg md:block">
        Hi! I&apos;m <span className="font-semibold text-[#22c55e]">TaxLaya</span> — your AI tax assistant.
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmailValid = EMAIL_REGEX.test(email.trim());
  const isCodeValid = /^\d{6}$/.test(code);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    if (!isEmailValid || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error || "Something went wrong. Please try again.");
        return;
      }

      setStep("otp");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (!isCodeValid || isLoading) return;

    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send both keys — the API accepts either `code` or `otp`.
        body: JSON.stringify({ email: email.trim(), code, otp: code }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error || "Invalid or expired code. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleUseDifferentEmail() {
    setStep("email");
    setCode("");
    setError(null);
  }

  return (
    <div className="bg-dot-grid min-h-screen bg-[#070F1A]">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Left / top-on-mobile: form + Why Axla cards */}
        <div className="flex w-full flex-col items-center px-6 py-10 sm:px-10 md:w-[45%] md:px-16 md:py-12">
          <div className="flex flex-col items-center">
            <Image
              src="/axla-logo-dark.png"
              alt="Axla"
              width={180}
              height={51}
              className="h-12 w-auto object-contain"
              priority
            />
            <p className="mt-2 text-xs text-slate-500">
              Always moving <span className="font-semibold text-[#22c55e]">forward.</span>
            </p>
          </div>

          <div className="mt-10 w-full max-w-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-[32px] font-bold leading-tight text-white">
                  {step === "email" ? (
                    <>
                      Welcome <span className="text-[#22c55e]">back</span>
                    </>
                  ) : (
                    "Check your email"
                  )}
                </h1>
                <p className="mt-2 text-slate-400">
                  {step === "email" ? "File your BIR in 3 minutes." : `We sent a code to ${email}.`}
                </p>
              </div>
              {step === "email" && <TaxlayaGreeting />}
            </div>

            {step === "email" ? (
              <form onSubmit={handleSendCode} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                    <input
                      id="email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={isLoading}
                      className="w-full rounded-xl border border-[#1E2D3D] bg-[#0F1A25] py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#22c55e] focus:ring-2 focus:ring-[#22c55e]/40 disabled:opacity-50"
                    />
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!isEmailValid || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#22c55e]/20 transition hover:bg-[#1ea952] hover:shadow-[#22c55e]/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  {isLoading ? "Sending code..." : "Continue with OTP"}
                </button>

                <p className="text-center text-xs text-slate-500">No password needed — we&apos;ll send you a code.</p>
              </form>
            ) : (
              <form onSubmit={handleVerifyCode} className="mt-8 space-y-4">
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-slate-300">
                    6-digit code
                  </label>
                  <input
                    id="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    disabled={isLoading}
                    className="w-full rounded-xl border border-[#1E2D3D] bg-[#0F1A25] px-4 py-3 text-center text-lg tracking-[0.5em] text-white placeholder-slate-500 outline-none transition focus:border-[#22c55e] focus:ring-2 focus:ring-[#22c55e]/40 disabled:opacity-50"
                  />
                </div>

                {error && (
                  <p role="alert" className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!isCodeValid || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#22c55e] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#22c55e]/20 transition hover:bg-[#1ea952] hover:shadow-[#22c55e]/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? "Verifying..." : "Verify & Login"}
                </button>

                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  disabled={isLoading}
                  className="w-full text-center text-sm text-slate-500 transition hover:text-slate-300 disabled:opacity-50"
                >
                  Use different email
                </button>
              </form>
            )}

            <div className="mt-6 flex justify-center">
              <JoinPill />
            </div>
          </div>

          {/* Why Axla cards — shown here on both mobile and desktop left column */}
          <div className="mt-10 w-full max-w-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">Why Axla?</h2>
            <div className="space-y-3">
              {BENEFITS.map((b) => (
                <div
                  key={b.title}
                  className="flex items-center gap-3 rounded-xl border border-[#1E2D3D] bg-[#0F1A25] p-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/10">
                    <b.icon className="h-4 w-4 text-[#22c55e]" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-white">{b.title}</p>
                    <p className="text-sm text-slate-400">{b.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" />
                </div>
              ))}
            </div>
          </div>

          <footer className="mt-10 text-center text-xs text-slate-600 md:text-left">© 2025 Axla — Your AI BIR agent</footer>
        </div>

        {/* Right: desktop only (md+) */}
        <div className="relative hidden overflow-hidden md:flex md:w-[55%]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#0A1F1A] to-[#070F1A]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#22c55e]/20 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-32 left-0 h-96 w-96 rounded-full bg-[#22c55e]/10 blur-[100px]" />

          <div className="relative z-10 flex w-full flex-col justify-center gap-8 px-16 py-16">
            <JoinPill />

            <div className="space-y-5">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#22c55e]/10">
                    <b.icon className="h-4 w-4 text-[#22c55e]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{b.title}</p>
                    <p className="text-sm text-slate-400">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center py-2">
              <DashboardMockup />
            </div>
          </div>

          {/* Decorative TaxLaya avatar — absolute within this panel only, not the fixed global widget (that's hidden entirely on this route). */}
          <div className="absolute bottom-6 right-6 z-10">
            <div className="relative h-14 w-14 overflow-hidden rounded-full border-2 border-[#22c55e]/40 shadow-[0_0_20px_rgba(34,197,94,0.35)]">
              <Image src="/taxlaya-avatar.png" alt="TaxLaya" width={56} height={56} className="h-full w-full object-cover" />
            </div>
            <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#070F1A] bg-[#22c55e] shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
          </div>
        </div>
      </div>
    </div>
  );
}
