"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

const HASSLE_LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [birHateLevel, setBirHateLevel] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (birHateLevel === null) {
      setStatus("error");
      setMessage("Please pick a hassle level from 1 to 10.");
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, bir_hate_level: birHateLevel }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Try again.");
        return;
      }

      setStatus("success");
      setMessage(data.message || "You're on the waitlist!");
      setEmail("");
      setBirHateLevel(null);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl bg-accent/10 p-6 text-center ring-1 ring-accent/30">
        <p className="text-lg font-semibold text-navy">{message} 🎉</p>
        <p className="mt-1 text-sm text-slate-600">
          Sasabihan ka namin sa email pag live na ang Axla.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-navy">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-navy placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>

      <div>
        <span className="mb-1.5 block text-sm font-medium text-navy">
          Gaano ka-hassle ang BIR sa&apos;yo?
        </span>
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
          {HASSLE_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setBirHateLevel(level)}
              aria-pressed={birHateLevel === level}
              className={`rounded-lg py-2 text-sm font-semibold transition ${
                birHateLevel === level
                  ? "bg-accent text-navy"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {level}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-slate-400">
          <span>Chill lang</span>
          <span>Sobrang hassle</span>
        </div>
      </div>

      {status === "error" && (
        <p className="text-sm font-medium text-red-600">{message}</p>
      )}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-navy shadow-lg shadow-accent/25 transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Submitting..." : "Join waitlist — Get 3 months free"}
      </button>
    </form>
  );
}
