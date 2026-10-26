"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Captions,
  Maximize2,
  Video,
  FileText,
  Users,
  CheckCircle2,
  Mail,
  Wallet,
  Clock,
  ShieldCheck,
  MousePointerClick,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PROMO, isPromoActive } from "@/lib/promo";

/**
 * 30-second looping promo video MOCKUP — not a real video file. A
 * Framer-Motion timeline drives 5 scenes (6s each) through the real Axla
 * dark/green brand (bg #0B0F1A, accent #00FF88, same card tokens as
 * OtpAuthForm/DashboardMockup/InstallPrompt), styled Figma/GCash-ad clean:
 * device-frame mockups with the app's own real copy, no cartoon character,
 * no stock photography. There's no audio track — "Music" is a visual beat
 * indicator only, per spec; "export" is an on-screen recording helper (see
 * RecordingPanel) since generating a real MP4 client-side is out of scope.
 *
 * Pricing is read live from lib/payroll's TaxLaya sibling, lib/promo.ts
 * (PROMO.proPricePesos, PROMO.endDate) — never hardcoded here, so this
 * never drifts from the real checkout price. As of whenever this renders,
 * check whether isPromoActive() is still true: PROMO.endDate was set to
 * 2026-09-20, a fixed 60-day window from when LAUNCH50 was built — if
 * that's already passed, Scene 4 switches from a day-countdown to an
 * evergreen "Launch Offer" badge automatically rather than ever showing a
 * stale/expired countdown as if it were still live.
 */

const SCENE_DURATION_MS = 6000;
const SCENE_COUNT = 5;
const TOTAL_DURATION_MS = SCENE_DURATION_MS * SCENE_COUNT;

const SCENE_TITLES = ["Problem", "Meet Axla", "How It Works", "Launch Offer", "Install Now"];

function captionsFor(promoActive: boolean): string[] {
  return [
    "Freelancer ka ba? Nalilito sa BIR? Takot sa RDO at penalties?",
    "Meet Axla — may TaxLaya Agent — RDO Runner mo!",
    "2-minute setup lang — OTP, upload, filed! No pila, no stress, BIR compliant!",
    promoActive
      ? `Launch promo — 50% OFF — ₱${PROMO.proPricePesos} lang from ₱499! Limited time!`
      : `Launch offer — 50% OFF — ₱${PROMO.proPricePesos} lang from ₱499!`,
    "I-install ang Axla App ngayon — axla.space — BIR filing, no stress!",
  ];
}

/** Common device bezel — phone (rounded, notch) or laptop (screen + base) — so every scene's mockup reads as one consistent "product shot" rather than five different drawing styles. */
function DeviceFrame({
  kind,
  className,
  children,
}: {
  kind: "phone" | "laptop";
  className?: string;
  children: React.ReactNode;
}) {
  if (kind === "laptop") {
    return (
      <div className={cn("w-full", className)}>
        <div className="overflow-hidden rounded-t-xl border-[5px] border-b-0 border-[#1E293B] bg-[#0B0F1A] shadow-2xl">
          {children}
        </div>
        <div className="mx-auto h-2.5 w-[88%] rounded-b-xl bg-gradient-to-b from-[#1E293B] to-[#0F1420]" />
      </div>
    );
  }
  return (
    <div className={cn("relative overflow-hidden rounded-[1.75rem] border-[5px] border-[#1E293B] bg-[#0B0F1A] shadow-2xl", className)}>
      <div className="pointer-events-none absolute left-1/2 top-1.5 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-black/70" />
      {children}
    </div>
  );
}

function CheckBadge({ delay }: { delay: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay, type: "spring", stiffness: 320, damping: 16 }}
      className="mx-auto mt-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#00FF88]"
    >
      <CheckCircle2 className="h-3.5 w-3.5 text-[#0B0F1A]" />
    </motion.div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold", className)}>
      {children}
    </span>
  );
}

const SCENE_TRANSITION = { duration: 0.45, ease: "easeOut" } as const;
const sceneBase = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: SCENE_TRANSITION,
};

/** Scene 1 (0-6s) — PROBLEM: messy BIR forms shaking on a laptop mockup, red tint. */
function Scene1Problem({ reduced }: { reduced: boolean }) {
  const forms = ["2551Q", "1701Q", "RDO Form", "Penalty?"];
  return (
    <motion.div {...sceneBase} className="absolute inset-0 flex flex-col items-center justify-center gap-6 overflow-hidden bg-[#0B0F1A] px-6">
      <motion.div
        className="pointer-events-none absolute inset-0 bg-red-600/10"
        animate={reduced ? {} : { opacity: [0.12, 0.28, 0.12] }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />

      <motion.div
        animate={reduced ? {} : { x: [0, -5, 5, -5, 5, 0] }}
        transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 1.3 }}
        className="relative z-10 w-full max-w-[17rem]"
      >
        <DeviceFrame kind="laptop">
          <div className="aspect-[16/10] bg-[#141A2A] p-3">
            <div className="grid grid-cols-2 gap-1.5">
              {forms.map((label, i) => (
                <motion.div
                  key={label}
                  initial={{ rotate: 0 }}
                  animate={{ rotate: i % 2 === 0 ? -3 : 3 }}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-2"
                >
                  <FileText className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  <span className="truncate text-[10px] font-semibold text-red-300">{label}</span>
                </motion.div>
              ))}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1.5">
              <Users className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-[10px] text-slate-400">RDO pila: 47 ahead&hellip; 😩</span>
            </div>
          </div>
        </DeviceFrame>
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="relative z-10 text-center text-2xl font-black leading-tight text-white sm:text-3xl"
      >
        BIR? RDO? 1701?
        <br />
        <span className="text-red-400">Nakakalito?</span>
      </motion.h2>
    </motion.div>
  );
}

/** Scene 2 (6-12s) — SOLUTION INTRO: app icon pop + glow, phone slides in, RDO Runner badge. */
function Scene2Solution() {
  return (
    <motion.div {...sceneBase} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#0B0F1A] to-[#0F1F15] px-6">
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{
          scale: 1,
          opacity: 1,
          boxShadow: ["0 0 0px rgba(0,255,136,0)", "0 0 70px rgba(0,255,136,0.55)", "0 0 36px rgba(0,255,136,0.3)"],
        }}
        transition={{ duration: 0.8, ease: "backOut" }}
        className="rounded-3xl"
      >
        <Image src="/icon-512.png" alt="Axla" width={92} height={92} className="rounded-2xl" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="text-center">
        <h2 className="text-2xl font-black text-white sm:text-3xl">
          Meet <span className="text-[#00FF88]">Axla</span>
        </h2>
        <p className="mt-0.5 text-sm font-semibold text-slate-300">Your TaxLaya Agent</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.55 }}>
        <Pill className="border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]">
          <ShieldCheck className="h-3.5 w-3.5" /> RDO Runner
        </Pill>
      </motion.div>

      <motion.div initial={{ x: 70, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.65, type: "spring", stiffness: 130, damping: 16 }}>
        <DeviceFrame kind="phone" className="w-32">
          <div className="flex aspect-[9/19] flex-col items-center justify-center gap-2 px-3">
            <Image src="/axla-logo-dark.png" alt="" width={84} height={24} className="h-5 w-auto object-contain" />
            <p className="text-center text-[7px] text-slate-500">
              Always moving <span className="font-semibold text-[#00FF88]">forward.</span>
            </p>
          </div>
        </DeviceFrame>
      </motion.div>
    </motion.div>
  );
}

/** Scene 3 (12-18s) — HOW IT WORKS: OTP / upload / filed, 3 phones + 2-min timer + badges. */
function Scene3HowItWorks() {
  return (
    <motion.div {...sceneBase} className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0B0F1A] px-4">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <Pill className="border-[#00FF88]/30 bg-[#00FF88]/5 text-[#00FF88]">
          <Clock className="h-3.5 w-3.5" /> 2-min setup
        </Pill>
      </motion.div>

      <div className="flex items-end justify-center gap-2.5">
        <motion.div initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="text-center">
          <DeviceFrame kind="phone" className="w-[4.6rem]">
            <div className="flex aspect-[9/19] flex-col items-center gap-1.5 px-2 pt-6">
              <Mail className="h-4 w-4 text-[#00FF88]" />
              <div className="flex gap-0.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="h-3 w-1.5 rounded-sm border border-[#1E293B] bg-[#141A2A]" />
                ))}
              </div>
              <span className="text-[5.5px] text-slate-500">Enter code</span>
            </div>
          </DeviceFrame>
          <CheckBadge delay={0.9} />
        </motion.div>

        <motion.div initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="-mt-3 text-center">
          <DeviceFrame kind="phone" className="w-20">
            <div className="flex aspect-[9/19] flex-col items-center justify-center gap-1.5 px-2 pt-6">
              <Wallet className="h-5 w-5 text-[#00FF88]" />
              <span className="text-center text-[6px] font-semibold text-white">GCash synced</span>
              <span className="text-[5px] text-slate-500">142 transactions</span>
            </div>
          </DeviceFrame>
          <CheckBadge delay={1.15} />
        </motion.div>

        <motion.div initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="text-center">
          <DeviceFrame kind="phone" className="w-[4.6rem]">
            <div className="flex aspect-[9/19] flex-col items-center gap-1 px-1.5 pt-6">
              <div className="w-full rounded-md bg-[#00FF88]/15 px-1.5 py-1.5 text-center">
                <span className="text-[6px] font-bold text-[#00FF88]">2551Q Filed ✅</span>
              </div>
            </div>
          </DeviceFrame>
          <CheckBadge delay={1.4} />
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }} className="flex flex-wrap items-center justify-center gap-1.5">
        {["No credit card", "BIR compliant", "2-min setup"].map((t) => (
          <span key={t} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300">
            {t}
          </span>
        ))}
      </motion.div>
    </motion.div>
  );
}

function Confetti({ reduced }: { reduced: boolean }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: reduced ? 0 : 16 }, (_, i) => ({
        id: i,
        left: Math.round((i / 16) * 100 + (i % 2 === 0 ? 2 : -2)),
        delay: (i % 6) * 0.3,
        color: i % 3 === 0 ? "#00FF88" : i % 3 === 1 ? "#ffffff" : "#FFD166",
      })),
    [reduced],
  );
  if (reduced) return null;
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute top-0 h-2 w-1 rounded-sm"
          style={{ left: `${p.left}%`, backgroundColor: p.color }}
          initial={{ y: -20, opacity: 0, rotate: 0 }}
          animate={{ y: "320%", opacity: [0, 1, 1, 0], rotate: 360 }}
          transition={{ duration: 2.4, delay: p.delay, repeat: Infinity, repeatDelay: 1 }}
        />
      ))}
    </div>
  );
}

/** Scene 4 (18-24s) — PRICING PROMO: real price from lib/promo.ts, countdown only while actually active. */
function Scene4Pricing({ reduced, promoActive, daysLeft }: { reduced: boolean; promoActive: boolean; daysLeft: number }) {
  return (
    <motion.div
      {...sceneBase}
      className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-hidden bg-gradient-to-b from-[#0B0F1A] to-[#0F1F15] px-6"
    >
      <Confetti reduced={reduced} />

      {promoActive ? (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Pill className="border-amber-400/30 bg-amber-400/15 text-amber-300">
            ⏳ {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </Pill>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Pill className="border-[#00FF88]/30 bg-[#00FF88]/15 text-[#00FF88]">🚀 Launch Offer</Pill>
        </motion.div>
      )}

      <div className="relative z-10 text-center">
        <p className="text-sm text-slate-500 line-through">₱499/mo</p>
        <motion.p
          animate={reduced ? {} : { scale: [1, 1.05, 1] }}
          transition={{ duration: 1.4, repeat: Infinity }}
          className="text-5xl font-black text-[#00FF88] sm:text-6xl"
        >
          ₱{PROMO.proPricePesos}
          <span className="text-lg font-bold text-slate-400">/mo</span>
        </motion.p>
        <p className="mt-1 text-sm font-bold text-white">50% OFF — code {PROMO.code}</p>
      </div>

      <motion.button
        type="button"
        animate={reduced ? {} : { scale: [1, 1.04, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="relative z-10 rounded-2xl bg-[#00FF88] px-8 py-3.5 text-sm font-black text-[#001A29] shadow-xl shadow-[#00FF88]/30"
      >
        Claim 50% OFF
      </motion.button>
    </motion.div>
  );
}

/** Scene 5 (24-30s) — CTA INSTALL: iPhone home-screen tile + Android install prompt (real copy from InstallPrompt.tsx), real scannable QR to axla.space, end card. */
function Scene5Cta() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("qrcode")
      .then((QRCode) => QRCode.toDataURL("https://axla.space", { width: 160, margin: 1, color: { dark: "#0B0F1A", light: "#ffffff" } }))
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <motion.div {...sceneBase} className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 bg-[#0B0F1A] px-5">
      <div className="flex items-end gap-3">
        <motion.div initial={{ x: -34, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 130, damping: 16 }}>
          <DeviceFrame kind="phone" className="w-[5.2rem]">
            <div className="flex aspect-[9/19] flex-col items-center justify-center gap-1.5 bg-gradient-to-b from-[#0B0F1A] to-[#0F1F15]">
              <Image src="/icon-192.png" alt="" width={34} height={34} className="rounded-xl" />
              <span className="text-[7px] font-medium text-white">Axla</span>
            </div>
          </DeviceFrame>
        </motion.div>

        <motion.div
          initial={{ x: 34, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 130, damping: 16, delay: 0.1 }}
          className="relative"
        >
          <DeviceFrame kind="phone" className="w-[6.4rem]">
            <div className="relative flex aspect-[9/19] flex-col justify-end bg-[#0F172A] p-1.5 pb-2.5">
              <div className="flex items-center gap-1.5 rounded-lg border border-[#00FF88]/30 bg-[#0B0F1A] p-1.5">
                <Image src="/icon-192.png" alt="" width={18} height={18} className="shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[6px] font-bold text-white">Install Axla App</p>
                  <p className="truncate text-[5px] text-slate-400">Parang GCash for BIR filing</p>
                </div>
              </div>
              <motion.span
                className="pointer-events-none absolute bottom-5 right-4 h-3 w-3 rounded-full border-2 border-[#00FF88]"
                animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <MousePointerClick className="pointer-events-none absolute bottom-4 right-3 h-3.5 w-3.5 text-[#00FF88]" />
            </div>
          </DeviceFrame>
        </motion.div>
      </div>

      <div className="flex h-[4.5rem] items-center justify-center">
        {qrDataUrl && (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="rounded-xl bg-white p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- client-generated data: URL (real scannable QR via the qrcode package), not a static asset */}
            <img src={qrDataUrl} alt="Scan to visit axla.space" width={64} height={64} />
          </motion.div>
        )}
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="text-center">
        <p className="text-sm font-bold text-white">axla.space</p>
        <p className="mt-0.5 text-xs text-slate-400">BIR filing, no stress.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.65 }} className="flex items-center gap-2">
        <Image src="/icon-192.png" alt="Axla" width={22} height={22} className="rounded-md" />
        <span className="text-xs font-black text-white sm:text-sm">
          Axla <span className="font-normal text-slate-400">— BIR Filing for Freelancers</span>
        </span>
      </motion.div>
    </motion.div>
  );
}

function BeatIndicator({ active }: { active: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1" aria-hidden="true">
      <div className="flex h-3 items-end gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <motion.span
            key={i}
            className="w-[3px] rounded-full bg-[#00FF88]"
            animate={active ? { height: ["20%", "100%", "45%", "80%", "20%"] } : { height: "20%" }}
            transition={{ duration: 0.9, repeat: active ? Infinity : 0, delay: i * 0.1, ease: "easeInOut" }}
          />
        ))}
      </div>
      <span className="hidden text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:inline">Lo-fi beat</span>
    </div>
  );
}

function RecordingPanel({ onReplay, onClose }: { onReplay: () => void; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="absolute inset-x-3 bottom-16 z-40 rounded-xl border border-[#00FF88]/30 bg-[#0B0F1A]/95 p-3 text-slate-300 shadow-xl backdrop-blur"
    >
      <p className="text-xs font-bold text-white">Record this as MP4 for FB Ads</p>
      <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[11px] leading-relaxed">
        <li>Mac: ⌘+Shift+5 → Record Selected Portion (select this player)</li>
        <li>Windows: Win+Alt+R (Xbox Game Bar)</li>
        <li>Phone: use your phone&apos;s built-in screen recorder</li>
        <li>Tap &ldquo;Replay from 0:00&rdquo; below, then start recording for one full 30s loop</li>
      </ol>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onReplay}
          className="rounded-lg bg-[#00FF88] px-2.5 py-1.5 text-[11px] font-bold text-[#001A29] transition hover:bg-[#1ee87f]"
        >
          Replay from 0:00
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition hover:text-slate-200"
        >
          Close
        </button>
      </div>
    </motion.div>
  );
}

export function TaxLayaPromoVideo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>();
  const lastTsRef = useRef<number | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const [elapsed, setElapsed] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showRecordingPanel, setShowRecordingPanel] = useState(false);

  useEffect(() => {
    if (!isPlaying) {
      lastTsRef.current = null;
      return;
    }
    function tick(ts: number) {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      setElapsed((prev) => (prev + dt) % TOTAL_DURATION_MS);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  const currentScene = Math.min(SCENE_COUNT - 1, Math.floor(elapsed / SCENE_DURATION_MS));
  const progressPct = (elapsed / TOTAL_DURATION_MS) * 100;

  // Re-evaluated on every render (cheap Date.now() math) rather than once at
  // module load, so a long-open tab or a page refresh right at the promo's
  // real end date always reflects the true current state — never a stale
  // "still active" snapshot from when the page first loaded.
  const promoActive = isPromoActive();
  const daysLeft = Math.max(0, Math.ceil((PROMO.endDate.getTime() - Date.now()) / 86_400_000));

  const captions = useMemo(() => captionsFor(promoActive), [promoActive]);

  const handleReplay = useCallback(() => {
    lastTsRef.current = null;
    setElapsed(0);
    setIsPlaying(true);
  }, []);

  function handleFullscreen() {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {});
    } else {
      el.requestFullscreen?.().catch(() => {
        // Fullscreen can be denied (iframe, permissions, unsupported browser) —
        // recording still works fine without it, so this is a silent no-op.
      });
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        ref={containerRef}
        className="relative mx-auto aspect-[9/16] w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F1A] shadow-2xl"
      >
        {/* Progress bar + scene ticks */}
        <div className="absolute inset-x-0 top-0 z-30 h-1 bg-white/10">
          <motion.div className="h-full bg-[#00FF88]" style={{ width: `${progressPct}%` }} />
          <div className="absolute inset-0 flex">
            {Array.from({ length: SCENE_COUNT }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-black/50 last:border-r-0" />
            ))}
          </div>
        </div>

        {/* Scene stage */}
        <AnimatePresence initial={false}>
          {currentScene === 0 && <Scene1Problem key="s0" reduced={Boolean(shouldReduceMotion)} />}
          {currentScene === 1 && <Scene2Solution key="s1" />}
          {currentScene === 2 && <Scene3HowItWorks key="s2" />}
          {currentScene === 3 && <Scene4Pricing key="s3" reduced={Boolean(shouldReduceMotion)} promoActive={promoActive} daysLeft={daysLeft} />}
          {currentScene === 4 && <Scene5Cta key="s4" />}
        </AnimatePresence>

        {/* Caption */}
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-4">
          <AnimatePresence mode="wait">
            {showCaptions && (
              <motion.p
                key={currentScene}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3 }}
                className="max-w-[92%] rounded-xl bg-black/70 px-3.5 py-2 text-center text-xs font-semibold leading-snug text-white backdrop-blur-sm sm:text-sm"
              >
                {captions[currentScene]}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Recording helper */}
        <AnimatePresence>
          {showRecordingPanel && <RecordingPanel onReplay={handleReplay} onClose={() => setShowRecordingPanel(false)} />}
        </AnimatePresence>

        {/* Controls */}
        <div className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-3 pb-2.5 pt-10">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={handleReplay}
              aria-label="Replay from start"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <BeatIndicator active={isPlaying && !isMuted} />

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowCaptions((c) => !c)}
              aria-label={showCaptions ? "Hide captions" : "Show captions"}
              aria-pressed={showCaptions}
              className={cn("flex h-7 w-7 items-center justify-center rounded-full transition", showCaptions ? "bg-[#00FF88] text-[#001A29]" : "bg-white/10 text-white hover:bg-white/20")}
            >
              <Captions className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
            >
              {isMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Below-player toolbar: scene label, fullscreen, record */}
      <div className="flex w-full max-w-sm flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Scene {currentScene + 1}/5 — <span className="font-semibold text-white">{SCENE_TITLES[currentScene]}</span>
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleFullscreen} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 font-medium text-slate-300 transition hover:border-[#00FF88]/40 hover:text-[#00FF88]">
            <Maximize2 className="h-3 w-3" /> Fullscreen
          </button>
          <button
            type="button"
            onClick={() => setShowRecordingPanel((s) => !s)}
            className="flex items-center gap-1 rounded-lg border border-[#00FF88]/30 bg-[#00FF88]/5 px-2 py-1 font-semibold text-[#00FF88] transition hover:bg-[#00FF88]/15"
          >
            <Video className="h-3 w-3" /> Record 30s
          </button>
        </div>
      </div>

      {!promoActive && (
        <p className="max-w-sm text-center text-[11px] text-amber-400/80">
          Heads up: {PROMO.code}&apos;s countdown window ended {PROMO.endDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}. Scene 4
          shows an evergreen &ldquo;Launch Offer&rdquo; badge instead of a day-countdown until promo.ts gets a new end date.
        </p>
      )}
    </div>
  );
}
