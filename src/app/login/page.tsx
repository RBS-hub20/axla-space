"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type Step = "email" | "otp";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-white">
            Tax<span className="text-green-500">Laya</span>
          </span>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-xl sm:p-8">
          {step === "email" ? (
            <>
              <h1 className="text-xl font-semibold text-white">Enter your email</h1>
              <p className="mt-1 text-sm text-gray-400">
                We&apos;ll send a 6-digit code to sign in. No password needed.
              </p>

              <form onSubmit={handleSendCode} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-300">
                    Email
                  </label>
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
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-transparent focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!isEmailValid || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? "Sending code..." : "Send Code"}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-white">Enter your code</h1>
              <p className="mt-1 text-sm text-gray-400">
                We sent a code to <span className="text-gray-200">{email}</span>.
              </p>

              <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-gray-300">
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
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3.5 py-2.5 text-center text-lg tracking-[0.5em] text-white placeholder-gray-500 outline-none transition focus:border-transparent focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                  />
                </div>

                {error && (
                  <p role="alert" className="text-sm text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!isCodeValid || isLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? "Verifying..." : "Verify & Login"}
                </button>

                <button
                  type="button"
                  onClick={handleUseDifferentEmail}
                  disabled={isLoading}
                  className="w-full text-center text-sm text-gray-400 transition hover:text-gray-200 disabled:opacity-50"
                >
                  Use different email
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
