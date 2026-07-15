"use client";

import { useState, type FormEvent } from "react";

const HATE_OPTIONS = [
  "Ang haba ng pila",
  "Di ko alam ilalagay sa forms",
  "Nagbabayad ako ng CPA kahit maliit lang kita ko",
  "Natatakot ako sa penalties",
  "Ayoko lang talaga, period",
];

type Status = "idle" | "loading" | "success" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [hate, setHate] = useState("");
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
        body: JSON.stringify({ email, hate }),
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
      setHate("");
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
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <label htmlFor="hate" className="mb-1.5 block text-sm font-medium text-navy">
          Ano pinaka-hate mo sa BIR?
        </label>
        <select
          id="hate"
          required
          value={hate}
          onChange={(e) => setHate(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <option value="" disabled>
            Pumili ng sagot
          </option>
          {HATE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
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
