"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, Loader2, MapPin, AlertTriangle } from "lucide-react";

interface EmployeeInfo {
  name: string;
  shop_name: string;
  last_log_type: "in" | "out" | null;
  working_since: string | null;
}

type Step = "loading" | "invalid" | "ready" | "selfie" | "submitting" | "done" | "error";

export default function ClockPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<EmployeeInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ needsApproval: boolean; distance: number | null; type: "in" | "out" } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/payroll/employee/by-token/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          setStep("invalid");
          return;
        }
        const data = await res.json();
        setInfo(data);
        setStep("ready");
      })
      .catch(() => setStep("invalid"));
  }, [token]);

  const nextAction: "in" | "out" = info?.last_log_type === "in" ? "out" : "in";

  function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setStep("selfie");
  }

  async function handleConfirm() {
    if (!selfieFile) return;
    setStep("submitting");
    setErrorMessage("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const formData = new FormData();
          formData.append("token", token);
          formData.append("type", nextAction);
          formData.append("lat", String(position.coords.latitude));
          formData.append("lng", String(position.coords.longitude));
          formData.append("code", code.trim());
          formData.append("selfie", selfieFile);

          const res = await fetch("/api/payroll/timekeeping/clock", { method: "POST", body: formData });
          const data = await res.json();
          if (!res.ok) {
            setErrorMessage(data.error || "Something went wrong. Please try again.");
            setStep("error");
            return;
          }
          setResult({ needsApproval: data.needs_approval, distance: data.distance, type: nextAction });
          setStep("done");
        } catch {
          setErrorMessage("Network error — please try again.");
          setStep("error");
        }
      },
      () => {
        setErrorMessage("Location access is required to clock in/out. Please enable it and try again.");
        setStep("error");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 py-10 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <span className="text-lg font-bold text-white">
            Axla <span className="text-[#00FF88]">Payroll</span>
          </span>
        </div>

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
            <p className="text-sm text-gray-400">Loading...</p>
          </div>
        )}

        {step === "invalid" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-white">This clock-in link isn&apos;t valid.</p>
            <p className="text-xs text-gray-500">Ask your employer for a new link.</p>
          </div>
        )}

        {info && (step === "ready" || step === "selfie" || step === "submitting") && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-xl font-bold text-white">Hi {info.name}! 👋</p>
              <p className="mt-1 text-sm text-gray-400">{info.shop_name}</p>
              {info.last_log_type === "in" && info.working_since && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 px-3 py-1 text-xs font-medium text-[#00FF88]">
                  <Clock className="h-3 w-3" />
                  Working since{" "}
                  {new Date(info.working_since).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>

            {step === "ready" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleSelfieChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition ${
                    nextAction === "in" ? "bg-[#00FF88] text-black hover:bg-[#22C55E]" : "bg-amber-500 text-black hover:bg-amber-400"
                  }`}
                >
                  <Camera className="h-5 w-5" />
                  {nextAction === "in" ? "Time In" : "Time Out"}
                </button>
                <p className="text-center text-xs text-gray-500">Taps open your camera for a quick selfie, then we'll ask for today's shop code.</p>
              </>
            )}

            {(step === "selfie" || step === "submitting") && selfiePreview && (
              <div className="space-y-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selfiePreview} alt="Selfie preview" className="mx-auto h-40 w-40 rounded-xl border border-white/10 object-cover" />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-300">Today&apos;s Shop Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="4829"
                    disabled={step === "submitting"}
                    className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-center text-2xl font-bold tracking-widest text-white placeholder-gray-700 focus:border-[#00FF88] focus:outline-none"
                  />
                  <p className="mt-1 text-center text-[11px] text-gray-500">Ask your employer — it&apos;s written on the shop whiteboard.</p>
                </div>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={step === "submitting"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-4 text-base font-bold text-black transition hover:bg-[#22C55E] disabled:opacity-60"
                >
                  {step === "submitting" ? <Loader2 className="h-5 w-5 animate-spin" /> : <MapPin className="h-5 w-5" />}
                  {step === "submitting" ? "Confirming..." : `Confirm ${nextAction === "in" ? "Time In" : "Time Out"}`}
                </button>
              </div>
            )}
          </div>
        )}

        {step === "error" && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-white">{errorMessage}</p>
            <button
              type="button"
              onClick={() => setStep("ready")}
              className="mt-2 rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              Try Again
            </button>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            {result.needsApproval ? (
              <>
                <Clock className="h-10 w-10 text-amber-400" />
                <p className="text-base font-bold text-white">Recorded ⏳</p>
                <p className="text-sm text-gray-400">
                  {result.distance !== null && result.distance > 0
                    ? `You're ${result.distance >= 1000 ? `${(result.distance / 1000).toFixed(1)}km` : `${Math.round(result.distance)}m`} from the shop.`
                    : "The shop code didn't match."}{" "}
                  Your employer will review this.
                </p>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-10 w-10 text-[#00FF88]" />
                <p className="text-base font-bold text-white">{result.type === "in" ? "Timed In" : "Timed Out"} ✅</p>
                <p className="text-sm text-gray-400">You&apos;re all set — see you next time!</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
