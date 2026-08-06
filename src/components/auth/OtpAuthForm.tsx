"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Loader2, Mail, Lock, Users, ArrowRight, Wallet, Calculator, FileCheck } from "lucide-react";
import { DashboardMockup } from "@/components/DashboardMockup";

type Step = "email" | "otp";
export type AuthMode = "login" | "signup";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BENEFITS = [
  { icon: Wallet, title: "GCash auto-sync", description: "Upload your transaction history, Axla reads it automatically." },
  { icon: Calculator, title: "2551Q auto-compute", description: "Gross sales, tax due, all computed — no manual math." },
  { icon: FileCheck, title: "BIR-ready PDF", description: "Clean, filing-ready reference sheet in one click." },
];

/** Neutral-bordered variant for the bottom of the login form. */
function JoinPill() {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1E293B] px-4 py-2 text-xs font-medium text-slate-300">
      <Users className="h-3.5 w-3.5 text-[#00FF88]" />
      Join Filipinos who hate BIR paperwork
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}

/** Green-bordered variant for the top of the right panel. */
function JoinPillAccent() {
  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-4 py-2 text-xs font-medium text-[#00FF88]">
      <Users className="h-3.5 w-3.5" />
      Join Filipinos who hate BIR paperwork
      <ArrowRight className="h-3.5 w-3.5" />
    </span>
  );
}

/** Only an internal path is ever honored — never an absolute/external URL, which would make this an open redirect. */
function sanitizeNextPath(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

/**
 * Shared by /login and /signup — same underlying flow (email OTP, no
 * password), since this app's auth is a single system either way: the
 * first OTP verification for an email creates the account (see
 * verify-otp/route.ts), every later one just signs back in. `mode` only
 * changes the copy shown, never the actual request logic. Google sign-in
 * isn't wired up here yet — that needs real OAuth credentials from Google
 * Cloud Console plus provider config in the Supabase Auth dashboard,
 * neither of which exists yet.
 */
function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = sanitizeNextPath(searchParams.get("next"));
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEmailValid = EMAIL_REGEX.test(email.trim());
  const isCodeValid = /^\d{6}$/.test(code);
  const isSignup = mode === "signup";

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

      router.push(next);
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
                {step === "otp" ? (
                  "Check your email"
                ) : isSignup ? (
                  <>
                    Start filing <span className="text-[#00FF88]">free</span>
                  </>
                ) : (
                  <>
                    Welcome <span className="text-[#00FF88]">back</span>
                  </>
                )}
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                {step === "otp"
                  ? `We sent a code to ${email}.`
                  : isSignup
                    ? "No credit card required. File your first BIR form in minutes."
                    : "File your BIR in 3 minutes."}
              </p>

              {step === "email" ? (
                <form onSubmit={handleSendCode} className="mt-8 space-y-4">
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
                    {isLoading ? "Sending code..." : isSignup ? "Start Filing Free" : "Continue with OTP"}
                  </button>

                  <p className="text-center text-xs text-slate-500">No password needed — we&apos;ll send you a code.</p>

                  <p className="text-center text-xs text-slate-500">
                    {isSignup ? (
                      <>
                        Already have an account?{" "}
                        <a href="/login" className="font-medium text-[#00FF88] hover:underline">
                          Log in
                        </a>
                      </>
                    ) : (
                      <>
                        New here?{" "}
                        <a href="/signup" className="font-medium text-[#00FF88] hover:underline">
                          Start filing free
                        </a>
                      </>
                    )}
                  </p>
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

          <footer className="mt-10 text-center text-xs text-slate-600">© 2025 Axla — Your AI BIR agent</footer>
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
              <DashboardMockup showChat={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OtpAuthForm({ mode }: { mode: AuthMode }) {
  return (
    <Suspense fallback={null}>
      <AuthForm mode={mode} />
    </Suspense>
  );
}
