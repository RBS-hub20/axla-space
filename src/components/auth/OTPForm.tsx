"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Step = "email" | "otp";

export function OTPForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setStep("otp");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, name }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Incorrect or expired code. Please try again.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleBack() {
    setStep("email");
    setOtp("");
    setError(null);
  }

  return (
    <div className="mx-auto w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <h1 className="mb-1 text-lg font-bold text-white">
        {step === "email" ? "Sign in to TaxLaya" : "Enter your code"}
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        {step === "email"
          ? "We'll email you a one-time code, no password needed."
          : `We sent a 6-digit code to ${email}.`}
      </p>

      {step === "email" ? (
        <form onSubmit={handleSendOtp} className="space-y-3">
          <div>
            <label htmlFor="name" className="mb-1 block text-xs font-medium text-slate-300">
              Name
            </label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Juan Dela Cruz"
              autoComplete="name"
              required
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-slate-300">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? "Sending code..." : "Send code"}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-3">
          <div>
            <label htmlFor="otp" className="mb-1 block text-xs font-medium text-slate-300">
              6-digit code
            </label>
            <Input
              id="otp"
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              autoComplete="one-time-code"
              className="text-center text-lg tracking-[0.5em]"
              required
              autoFocus
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <Button type="submit" disabled={isLoading || otp.length !== 6} className="w-full">
            {isLoading ? "Verifying..." : "Verify"}
          </Button>

          <button
            type="button"
            onClick={handleBack}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-200"
          >
            Use a different email
          </button>
        </form>
      )}
    </div>
  );
}
