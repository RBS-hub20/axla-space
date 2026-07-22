"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [birHateLevel, setBirHateLevel] = useState(5);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

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
      setBirHateLevel(5);
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/10 p-6 text-center">
        <p className="text-lg font-semibold text-white">{message} 🎉</p>
        <p className="mt-1 text-sm text-slate-400">
          Sasabihan ka namin sa email pag live na ang Axla.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
          Email address
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#00FF88] focus:outline-none focus:ring-2 focus:ring-[#00FF88]/30"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Gaano ka-hassle ang BIR sa&apos;yo?</span>
          <span className="rounded-full bg-[#00FF88]/15 px-2.5 py-0.5 text-sm font-bold text-[#00FF88]">
            {birHateLevel}/10
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={birHateLevel}
          onChange={(e) => setBirHateLevel(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#00FF88]"
        />
        <div className="mt-1.5 flex justify-between text-xs text-slate-500">
          <span>Chill lang</span>
          <span>Sobrang hassle</span>
        </div>
      </div>

      {status === "error" && <p className="text-sm font-medium text-red-400">{message}</p>}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-full bg-[#00FF88] px-6 py-3.5 text-base font-semibold text-[#080F14] shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "loading" ? "Submitting..." : "Join waitlist — Get 3 months free"}
      </button>
    </form>
  );
}
