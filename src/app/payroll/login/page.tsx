"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, Mail, Lock, ArrowRight, Smartphone, ShieldCheck, FileText, Users, Wallet } from "lucide-react";

type Step = "email" | "otp";
type Mode = "login" | "signup";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BENEFITS = [
  { icon: Smartphone, title: "GCash auto-payslip", description: "Upload staff, Axla sends payslip automatically." },
  { icon: ShieldCheck, title: "DOLE Guard auto-check", description: "₱479 Batangas minimum, SIL, 13th month — all computed." },
  { icon: FileText, title: "BIR 1601C + 2316 ready", description: "Clean, filing-ready in one click." },
];

/** Only an internal path is ever honored — never an absolute/external URL, which would make this an open redirect. */
function sanitizePath(value: string | null, fallback: string): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return fallback;
}

function JoinPill() {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1E293B] px-4 py-2 text-xs font-medium text-slate-300">
      <Users className="h-3.5 w-3.5 text-[#00FF88]" />
      Join 500+ businesses who hate manual payroll
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}

function JoinPillAccent() {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-4 py-2 text-xs font-medium text-[#00FF88]">
      <Users className="h-3.5 w-3.5" />
      Join 500+ businesses who hate manual payroll
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}

/** Small payroll-flavored mockup — same visual language as the landing page's hero preview card, not TaxLaya's DashboardMockup. */
function PayrollMockup() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#11172A] shadow-2xl">
      <div className="flex items-center justify-between bg-[#00FF88] px-5 py-3">
        <span className="text-sm font-bold text-black">Double R Water - Payroll</span>
        <span className="text-xs font-semibold text-black/70">Dashboard</span>
      </div>
      <div className="grid grid-cols-2 gap-3 p-5">
        <div className="col-span-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Staff</p>
            <Users className="h-3.5 w-3.5 text-[#00FF88]" />
          </div>
          <p className="mt-1 text-sm text-white">Juan D. · Maria S. · +3 more</p>
        </div>
        <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/[0.06] p-4">
          <p className="text-xs text-slate-400">Total Sahod</p>
          <p className="mt-1 text-xl font-bold text-[#00FF88]">₱23,950</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-xs text-slate-400">Status</p>
          <p className="mt-1 flex items-center gap-1 text-sm font-bold text-white">
            <Wallet className="h-3.5 w-3.5 text-[#00FF88]" />
            Ready
          </p>
        </div>
      </div>
    </div>
  );
}

function PayrollLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizePath(searchParams.get("next"), "/payroll/app");
  const plan = searchParams.get("plan");

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
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
      const res = await fetch("/api/payroll/auth/send-otp", {
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
        body: JSON.stringify({ email: email.trim(), code }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.success) {
        setError(data?.error || "Invalid or expired code. Please try again.");
        return;
      }

      // Best-effort — a failed save here shouldn't block getting into the
      // dashboard; the company setup modal there is the fallback.
      if (businessName.trim()) {
        try {
          await fetch("/api/payroll/company", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ businessName: businessName.trim() }),
          });
        } catch {
          // ignore — dashboard's own setup modal covers this
        }
      }

      const destination = plan ? `${next}${next.includes("?") ? "&" : "?"}plan=${encodeURIComponent(plan)}` : next;
      router.push(destination);
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
    <div className="min-h-screen bg-[#0B0F1A]">
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* Left / top-on-mobile: centered login form */}
        <div className="bg-dot-grid flex min-h-screen w-full flex-col items-center justify-center bg-[#0B0F1A] px-8 py-10 md:w-[45%]">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center text-center">
              <Image
                src="/axla-logo-dark.png"
                alt="Axla"
                width={180}
                height={51}
                className="h-12 w-auto object-contain"
                priority
              />
              <p className="mt-2 text-xs text-slate-500">
                Always moving <span className="font-semibold text-[#00FF88]">forward.</span>
              </p>
            </div>

            <div className="mt-10">
              <h1 className="text-3xl font-bold leading-tight text-white">
                {step === "email" ? (
                  mode === "login" ? (
                    <>
                      Welcome <span className="text-[#00FF88]">back</span>
                    </>
                  ) : (
                    "Create your account"
                  )
                ) : (
                  "Check your email"
                )}
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                {step === "email"
                  ? "Pasahod, Payslip & DOLE in 2 minutes. No manual payroll. Libre mag browse."
                  : `We sent a code to ${email}.`}
              </p>

              {step === "email" && (
                <div className="mt-6 flex gap-1 rounded-lg bg-[#141A2A] p-1">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                      mode === "login" ? "bg-[#00FF88] text-black" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Login
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("signup")}
                    className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition ${
                      mode === "signup" ? "bg-[#00FF88] text-black" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              )}

              {step === "email" ? (
                <form onSubmit={handleSendCode} className="mt-6 space-y-4">
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
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
                        className="w-full rounded-lg border border-[#1E293B] bg-[#141A2A] p-3 pl-11 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/40 disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {mode === "signup" && (
                    <div>
                      <label htmlFor="businessName" className="mb-1.5 block text-sm font-medium text-slate-300">
                        Business Name <span className="text-slate-500">(optional)</span>
                      </label>
                      <input
                        id="businessName"
                        type="text"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Double R Water"
                        disabled={isLoading}
                        className="w-full rounded-lg border border-[#1E293B] bg-[#141A2A] p-3 text-sm text-white placeholder-slate-500 outline-none transition focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/40 disabled:opacity-50"
                      />
                    </div>
                  )}

                  {error && (
                    <p role="alert" className="rounded-lg border border-red-900/40 bg-red-950/30 px-3 py-2 text-sm text-red-400">
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={!isEmailValid || isLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-4 py-3 text-sm font-bold text-[#001A29] shadow-lg shadow-[#00FF88]/20 transition hover:bg-[#1ee87f] hover:shadow-[#00FF88]/40 disabled:cursor-not-allowed disabled:opacity-50"
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
                      className="w-full rounded-lg border border-[#1E293B] bg-[#141A2A] p-3 text-center text-lg tracking-[0.5em] text-white placeholder-slate-500 outline-none transition focus:border-[#00FF88] focus:ring-2 focus:ring-[#00FF88]/40 disabled:opacity-50"
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
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#00FF88] px-4 py-3 text-sm font-bold text-[#001A29] shadow-lg shadow-[#00FF88]/20 transition hover:bg-[#1ee87f] hover:shadow-[#00FF88]/40 disabled:cursor-not-allowed disabled:opacity-50"
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

              <div className="mt-8 flex justify-center">
                <JoinPill />
              </div>
            </div>
          </div>

          <footer className="mt-10 text-center text-xs text-slate-600">© 2026 Axla Payroll — Pasahod, Payslip &amp; DOLE Agent</footer>
        </div>

        {/* Right: desktop only (md+) */}
        <div className="relative hidden overflow-hidden md:flex md:w-[55%]">
          <div className="absolute inset-0 bg-[#0F172A]" />
          <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-[#00FF88]/10 blur-[100px]" />
          <div className="pointer-events-none absolute -bottom-32 left-0 h-[28rem] w-[28rem] rounded-full bg-[#00FF88]/20 blur-[110px]" />

          <div className="relative z-10 flex w-full flex-col justify-center gap-8 px-16 py-16">
            <JoinPillAccent />

            <div className="space-y-5">
              {BENEFITS.map((b) => (
                <div key={b.title} className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00FF88]/10">
                    <b.icon className="h-4 w-4 text-[#00FF88]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{b.title}</p>
                    <p className="text-sm text-slate-400">{b.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-center py-2">
              <PayrollMockup />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayrollLoginPage() {
  return (
    <Suspense fallback={null}>
      <PayrollLoginForm />
    </Suspense>
  );
}
