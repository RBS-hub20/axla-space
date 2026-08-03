"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock, Loader2, MapPin, AlertTriangle, Navigation, RotateCcw, Wallet, Eye } from "lucide-react";
import { CUTOFF_LABELS, type CutOff } from "@/lib/payroll/sahod";
import type { PaymentProof } from "@/lib/payroll/payment-proof";
import { pickBlinkChallenge } from "@/lib/payroll/blink-challenge";

interface EmployeeInfo {
  name: string;
  shop_name: string;
  last_log_type: "in" | "out" | null;
  last_log: { type: "in" | "out"; timestamp: string } | null;
  working_since: string | null;
  shop_lat: number | null;
  shop_lng: number | null;
}

const MANILA_TIME_ZONE = "Asia/Manila";

type Step =
  | "loading"
  | "invalid"
  | "primer"
  | "locating"
  | "location_slow"
  | "location_error"
  | "selfie_prompt"
  | "camera_live"
  | "selfie_ready"
  | "submitting"
  | "error"
  | "done";

interface Coords {
  lat: number;
  lng: number;
  demo: boolean;
  /** From position.coords — null in Demo Mode (no real GPS fix exists to read them from). Sent to the server for the mock-location heuristic; see checkMockLocation()'s doc comment for what these can and can't prove. */
  accuracy: number | null;
  altitude: number | null;
}

const GEO_TIMEOUT_MS = 15000;
const isIOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);

/** Always Asia/Manila regardless of the device's own timezone — a phone with the wrong system timezone shouldn't misreport what time someone actually clocked in. */
function formatManilaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", timeZone: MANILA_TIME_ZONE });
}

function formatDuration(sinceIso: string): string {
  const totalMin = Math.max(0, Math.floor((Date.now() - new Date(sinceIso).getTime()) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function formatManilaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: MANILA_TIME_ZONE });
}

function formatManilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: MANILA_TIME_ZONE,
  });
}

interface PayrollHistoryEntry {
  runId: string;
  month: string;
  cutOff: CutOff | null;
  netPay: number;
  proof: PaymentProof;
}

type ConfirmStep = "idle" | "selfie" | "submitting" | "done";

/**
 * Self-contained (own fetch, own tiny state machine) rather than woven
 * into the Time In/Out step machine above — the two flows don't share any
 * state and keeping them separate avoids one giant step union covering
 * two unrelated user journeys.
 */
function MyPayrollCard({ token }: { token: string }) {
  const [history, setHistory] = useState<PayrollHistoryEntry[] | null>(null);
  const [confirmStep, setConfirmStep] = useState<ConfirmStep>("idle");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    fetch(`/api/payroll/employee/by-token/${token}/payroll?t=${Date.now()}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setHistory(data.history))
      .catch(() => {});
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!history || history.length === 0) return null;
  const latest = history[0];
  const { proof } = latest;

  function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setConfirmStep("selfie");
  }

  async function handleConfirmReceived() {
    if (!selfieFile) return;
    setConfirmStep("submitting");
    setError("");
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("runId", latest.runId);
      formData.append("selfie", selfieFile);
      const res = await fetch(`/api/payroll/employee/by-token/${token}/confirm-payment`, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to confirm — try again.");
        setConfirmStep("selfie");
        return;
      }
      setConfirmStep("done");
      load();
    } catch {
      setError("Network error — try again.");
      setConfirmStep("selfie");
    }
  }

  const periodLabel = latest.cutOff ? `${latest.month} · ${CUTOFF_LABELS[latest.cutOff]}` : latest.month;

  return (
    <div className="rounded-xl border border-white/10 bg-[#141414] p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Wallet className="h-3.5 w-3.5" />
        My Payroll
      </p>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-white">{periodLabel}</p>
        <p className="text-lg font-bold text-[#00FF88]">₱{latest.netPay.toLocaleString()}</p>
      </div>

      {proof.status === "unpaid" && <p className="mt-1 text-xs text-gray-500">Not yet paid.</p>}

      {proof.status === "paid" && (
        <>
          <p className="mt-1 text-xs text-gray-400">
            Status: Paid{proof.paidAt ? ` ${formatManilaDate(proof.paidAt)}` : ""}
            {proof.gcashRef ? ` — Ref ${proof.gcashRef}` : proof.note ? ` — ${proof.note}` : ""}
          </p>
          {confirmStep === "idle" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleSelfieChange}
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00FF88] py-2.5 text-sm font-bold text-black hover:bg-[#22C55E]"
              >
                Confirm Received ₱{latest.netPay.toLocaleString()}
              </button>
            </>
          )}
          {(confirmStep === "selfie" || confirmStep === "submitting") && selfiePreview && (
            <div className="mt-2 space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selfiePreview} alt="Confirmation selfie preview" className="mx-auto h-24 w-24 rounded-lg border border-white/10 object-cover" />
              {error && <p className="text-center text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={handleConfirmReceived}
                disabled={confirmStep === "submitting"}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#00FF88] py-2.5 text-sm font-bold text-black hover:bg-[#22C55E] disabled:opacity-60"
              >
                {confirmStep === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {confirmStep === "submitting" ? "Confirming..." : "Confirm Received"}
              </button>
            </div>
          )}
        </>
      )}

      {proof.status === "confirmed" && (
        <p className="mt-1 text-xs text-[#00FF88]">Confirmed ✅{proof.confirmedAt ? ` ${formatManilaDateTime(proof.confirmedAt)}` : ""}</p>
      )}
      {confirmStep === "done" && proof.status !== "confirmed" && <p className="mt-1 text-xs text-[#00FF88]">Confirmed ✅</p>}

      <a href={`/p/${token}/payslip/${latest.runId}`} className="mt-3 block text-center text-xs text-gray-400 underline hover:text-white">
        View Payslip PDF
      </a>
    </div>
  );
}

export default function ClockPage({ params }: { params: { token: string } }) {
  const { token } = params;
  const [step, setStep] = useState<Step>("loading");
  const [info, setInfo] = useState<EmployeeInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [coords, setCoords] = useState<Coords | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ needsApproval: boolean; distance: number | null; type: "in" | "out" } | null>(null);
  // Picked fresh each time the selfie step is reached — see blink-challenge.ts
  // for exactly what this can and can't prove (finding #5, manual-review aid).
  const [blinkInstruction, setBlinkInstruction] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const geoSettledRef = useRef(false);

  /**
   * `?t=` cache-busts the URL itself and `cache: "no-store"` tells fetch
   * not to reuse a prior response — Safari has been observed serving a
   * stale Time In/Out state from its own HTTP cache when the same link is
   * reopened, on top of (and separate from) the server-side caching this
   * route's `dynamic = "force-dynamic"` already rules out.
   */
  function loadInfo() {
    return fetch(`/api/payroll/employee/by-token/${token}?t=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setStep("invalid");
          return;
        }
        const data: EmployeeInfo = await res.json();
        setInfo(data);
        setStep((prev) => (prev === "loading" ? "primer" : prev));
      })
      .catch(() => setStep("invalid"));
  }

  useEffect(() => {
    loadInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Safari can restore this page from its back/forward cache (bfcache) on
  // reopen without re-running the mount effect at all — the JS heap and
  // React state are frozen and resumed as-is, so `info` would otherwise
  // stay exactly as stale as it was when the tab was suspended. `pageshow`
  // with `persisted: true` is the standard signal for "this is a bfcache
  // restore, not a fresh load" and forces a refetch in that case.
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) loadInfo();
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Live camera stream is only attached to <video> once step === "camera_live"
  // actually renders it — and torn down the moment we leave that step, so it
  // never keeps recording in the background.
  useEffect(() => {
    if (step === "camera_live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    } else if (step !== "camera_live" && streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [step]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextAction: "in" | "out" = info?.last_log_type === "in" ? "out" : "in";

  /**
   * Called directly from the primer button's onClick — no async/await
   * before this line, no camera app-switch beforehand. iOS Safari only
   * honors navigator.geolocation as a "real" user gesture when it's the
   * immediate, synchronous result of the tap, which is why this used to
   * live inside the (async) submit handler and silently fail there instead.
   */
  function handleEnableLocation() {
    setStep("locating");
    setErrorMessage("");
    geoSettledRef.current = false;

    const slowTimer = setTimeout(() => {
      if (!geoSettledRef.current) {
        setStep("location_slow");
      }
    }, GEO_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geoSettledRef.current) return;
        geoSettledRef.current = true;
        clearTimeout(slowTimer);
        setCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          demo: false,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
        });
        setBlinkInstruction(pickBlinkChallenge());
        setStep("selfie_prompt");
      },
      (err) => {
        if (geoSettledRef.current) return;
        geoSettledRef.current = true;
        clearTimeout(slowTimer);
        setErrorMessage(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied. On iPhone: Settings → Safari → Location → Ask, or Settings → Privacy & Security → Location Services. Then reload this page."
            : "Couldn't get your location. Please try again.",
        );
        setStep("location_error");
      },
      { enableHighAccuracy: true, timeout: GEO_TIMEOUT_MS },
    );
  }

  function handleUseDemoMode() {
    geoSettledRef.current = true;
    if (info?.shop_lat == null || info?.shop_lng == null) {
      setErrorMessage("Demo Mode isn't ready yet — ask your employer to set the shop location first, then try again.");
      setStep("location_error");
      return;
    }
    setCoords({ lat: info.shop_lat, lng: info.shop_lng, demo: true, accuracy: null, altitude: null });
    setBlinkInstruction(pickBlinkChallenge());
    setStep("selfie_prompt");
  }

  function handleSelfieButtonClick() {
    if (isIOS && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "user" }, audio: false })
        .then((stream) => {
          streamRef.current = stream;
          setStep("camera_live");
        })
        .catch(() => fileInputRef.current?.click());
      return;
    }
    fileInputRef.current?.click();
  }

  function handleSelfieChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
    setStep("selfie_ready");
  }

  function handleCapturePhoto() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
        setSelfieFile(file);
        setSelfiePreview(URL.createObjectURL(file));
        setStep("selfie_ready");
      },
      "image/jpeg",
      0.85,
    );
  }

  function handleRetake() {
    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setSelfieFile(null);
    setSelfiePreview(null);
    setStep("selfie_prompt");
  }

  async function handleConfirm() {
    if (!selfieFile || !coords) return;
    setStep("submitting");
    setErrorMessage("");
    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("type", nextAction);
      formData.append("lat", String(coords.lat));
      formData.append("lng", String(coords.lng));
      formData.append("code", code.trim());
      formData.append("selfie", selfieFile);
      if (coords.accuracy !== null) formData.append("accuracy", String(coords.accuracy));
      if (coords.altitude !== null) formData.append("altitude", String(coords.altitude));
      if (blinkInstruction) formData.append("blinkInstruction", blinkInstruction);

      const res = await fetch("/api/payroll/timekeeping/clock", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Something went wrong. Please try again.");
        setStep("error");
        return;
      }
      setResult({ needsApproval: data.needs_approval, distance: data.distance, type: nextAction });
      // Toggle immediately from this response rather than waiting on (or
      // trusting) a follow-up GET — the button/status would otherwise keep
      // showing the pre-clock state until the page is reopened.
      setInfo((prev) =>
        prev
          ? {
              ...prev,
              last_log_type: data.last_log_type ?? nextAction,
              last_log: { type: data.last_log_type ?? nextAction, timestamp: data.timestamp },
              working_since: (data.last_log_type ?? nextAction) === "in" ? data.timestamp : null,
            }
          : prev,
      );
      setStep("done");
    } catch {
      setErrorMessage("Network error — please try again.");
      setStep("error");
    }
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

        {info && step !== "loading" && step !== "invalid" && (
          <div className="space-y-5">
            <div className="text-center">
              <p className="text-xl font-bold text-white">Hi {info.name}! 👋</p>
              <p className="mt-1 text-sm text-gray-400">{info.shop_name}</p>
              {info.last_log?.type === "in" ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#00FF88]/10 px-3 py-1.5 text-xs font-medium text-[#00FF88]">
                  <Clock className="h-3 w-3 shrink-0" />
                  Working since {formatManilaTime(info.last_log.timestamp)} · {formatDuration(info.last_log.timestamp)} — tap Time Out when done
                </p>
              ) : info.last_log?.type === "out" ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  Last out at {formatManilaTime(info.last_log.timestamp)} — see you tomorrow!
                </p>
              ) : (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-400">
                  <Clock className="h-3 w-3 shrink-0" />
                  Not yet timed in today
                </p>
              )}
            </div>

            {/* Always mounted (not step-gated) so refs from other steps —
                e.g. the camera_live fallback button — can reliably reach it
                the instant they call fileInputRef.current?.click(). */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleSelfieChange}
              onClick={(e) => {
                (e.currentTarget as HTMLInputElement).value = "";
              }}
              className="hidden"
            />

            {step === "primer" && (
              <>
                <button
                  type="button"
                  onClick={handleEnableLocation}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-4 text-base font-bold text-black transition hover:bg-[#22C55E]"
                >
                  <Navigation className="h-5 w-5" />
                  Allow Location &amp; Continue
                </button>
                <p className="text-center text-xs text-gray-500">We use this once, just to confirm you&apos;re at the shop.</p>
                <MyPayrollCard token={token} />
              </>
            )}

            {step === "locating" && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
                <p className="text-sm font-semibold text-white">Getting your location... 📍</p>
                <p className="text-xs text-gray-500">If iOS asks to allow location, tap Allow.</p>
              </div>
            )}

            {step === "location_slow" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <AlertTriangle className="h-8 w-8 text-amber-400" />
                <p className="text-sm font-semibold text-white">GPS is taking a while.</p>
                <p className="text-xs text-gray-500">Keep waiting, or continue without exact GPS — your employer can still review it.</p>
                <button
                  type="button"
                  onClick={handleUseDemoMode}
                  className="mt-1 w-full rounded-xl border border-[#00FF88]/40 py-3 text-sm font-semibold text-[#00FF88] hover:bg-[#00FF88]/10"
                >
                  Use Demo Mode
                </button>
                <button type="button" onClick={handleEnableLocation} className="text-xs text-gray-500 underline">
                  Try GPS again
                </button>
              </div>
            )}

            {step === "location_error" && (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <AlertTriangle className="h-8 w-8 text-red-400" />
                <p className="text-sm font-semibold text-white">Location Denied</p>
                <p className="text-xs text-gray-400">{errorMessage}</p>
                <button
                  type="button"
                  onClick={handleEnableLocation}
                  className="mt-1 w-full rounded-xl bg-[#00FF88] py-3 text-sm font-bold text-black hover:bg-[#22C55E]"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={handleUseDemoMode}
                  className="w-full rounded-xl border border-white/10 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"
                >
                  Use Demo Mode
                </button>
              </div>
            )}

            {step === "selfie_prompt" && (
              <>
                {coords?.demo && (
                  <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-center text-[11px] text-amber-300">
                    Demo Mode — using the shop&apos;s location instead of your exact GPS.
                  </p>
                )}
                {blinkInstruction && (
                  <p className="flex items-center justify-center gap-1.5 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/[0.06] px-3 py-2 text-center text-xs font-medium text-[#00FF88]">
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    {blinkInstruction}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleSelfieButtonClick}
                  className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-base font-bold transition ${
                    nextAction === "in" ? "bg-[#00FF88] text-black hover:bg-[#22C55E]" : "bg-amber-500 text-black hover:bg-amber-400"
                  }`}
                >
                  <Camera className="h-5 w-5" />
                  {nextAction === "in" ? "Time In" : "Time Out"}
                </button>
                <p className="text-center text-xs text-gray-500">Taps open your camera for a quick selfie, then we&apos;ll ask for today&apos;s shop code.</p>
              </>
            )}

            {step === "camera_live" && (
              <div className="space-y-3">
                {blinkInstruction && (
                  <p className="flex items-center justify-center gap-1.5 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/[0.06] px-3 py-2 text-center text-xs font-medium text-[#00FF88]">
                    <Eye className="h-3.5 w-3.5 shrink-0" />
                    {blinkInstruction}
                  </p>
                )}
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video ref={videoRef} playsInline muted autoPlay className="aspect-square w-full scale-x-[-1] object-cover" />
                </div>
                <canvas ref={canvasRef} className="hidden" />
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-4 text-base font-bold text-black hover:bg-[#22C55E]"
                >
                  <Camera className="h-5 w-5" />
                  Capture
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("selfie_prompt");
                    fileInputRef.current?.click();
                  }}
                  className="w-full text-center text-xs text-gray-500 underline"
                >
                  Having trouble? Use device camera instead
                </button>
              </div>
            )}

            {(step === "selfie_ready" || step === "submitting") && selfiePreview && (
              <div className="space-y-4">
                <div className="relative mx-auto h-40 w-40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selfiePreview} alt="Selfie preview" className="h-40 w-40 rounded-xl border border-white/10 object-cover" />
                  {step === "selfie_ready" && (
                    <button
                      type="button"
                      onClick={handleRetake}
                      aria-label="Retake photo"
                      className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-[#1a1a1a] text-slate-300 hover:text-white"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </button>
                  )}
                </div>
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
              onClick={() => setStep(coords ? "selfie_ready" : "primer")}
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
