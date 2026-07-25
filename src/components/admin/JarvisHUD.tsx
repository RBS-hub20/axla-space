"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JetBrains_Mono } from "next/font/google";
import { Mic } from "lucide-react";
import { getManilaGreeting, formatManilaTime, type ShiftLabel } from "@/lib/manila-time";
import type { BirDeadline } from "@/lib/bir-deadlines";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"] });

type Persona = "jarvis" | "friday";
type VisualState = "idle" | "listening" | "thinking" | "speaking";

const JARVIS_VOICE_ID = "IRHApOXLvnW57QJPQH2P"; // "Adam - Deep Jarvis" / default male voice (server keeps the old ID accepted as a fallback)
const FRIDAY_VOICE_ID = "c6SfcYrb2t09NHXiT80T"; // "Eva" / FRIDAY Female
const PERSONA_STORAGE_KEY = "axla-admin-jarvis-persona"; // shared with JarvisBar so both stay in sync

const CYAN = "#00D4FF";
const GREEN = "#00FF88";

interface JarvisStats {
  totalUsers: number;
  totalWaitlist: number;
  avgHateLevel: number;
  invoicesTotal: number;
  invoicesPaidTotal: number;
  paymongoRevenue: number;
  mrr: number;
  dtiCount: number;
  axlaDtiName: string | null;
}

interface RecentSignup {
  email: string;
  createdAt: string;
}

interface LiveToast {
  id: number;
  message: string;
}

const POLL_INTERVAL_MS = 10_000;
const ORB_PULSE_DURATION_MS = 1000;
const VITALS_PULSE_DURATION_MS = 1000;
const TOAST_DURATION_MS = 4000;

function secondsAgoLabel(lastSyncedAt: number | null): string {
  if (lastSyncedAt === null) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
  return seconds <= 1 ? "just now" : `${seconds}s ago`;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

function getSpeechSynthesis(): SpeechSynthesis | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis;
}

// ---- Living orb particle system ----

type ColorGroup = "blue" | "green" | "purple" | "magenta" | "white";
type OrbLayer = "core" | "mid" | "outer";

const PALETTE: Record<ColorGroup, string> = {
  blue: "#00D4FF",
  green: "#00FF88",
  purple: "#8B5CF6",
  magenta: "#FF00FF",
  white: "#FFFFFF",
};

// blue 40% / green 20% / purple 15% / magenta 15% / white 10%
const COLOR_WEIGHTS: Array<[ColorGroup, number]> = [
  ["blue", 0.4],
  ["green", 0.2],
  ["purple", 0.15],
  ["magenta", 0.15],
  ["white", 0.1],
];

function pickColorGroup(): ColorGroup {
  const r = Math.random();
  let cumulative = 0;
  for (const [group, weight] of COLOR_WEIGHTS) {
    cumulative += weight;
    if (r <= cumulative) return group;
  }
  return "blue";
}

// How much each color group is emphasized (size/opacity multiplier) per
// visual state — particles keep their own fixed color (reassigning colors
// every frame would look glitchy), but the overall palette balance shifts
// with state so it genuinely feels reactive rather than a static rainbow.
const STATE_EMPHASIS: Record<VisualState, Record<ColorGroup, number>> = {
  idle: { blue: 1, green: 0.9, purple: 0.5, magenta: 0.4, white: 0.7 },
  listening: { blue: 0.6, green: 1.5, purple: 0.5, magenta: 0.4, white: 1 },
  thinking: { blue: 0.6, green: 0.5, purple: 1.6, magenta: 0.9, white: 0.8 },
  speaking: { blue: 1.3, green: 1.3, purple: 1.3, magenta: 1.3, white: 1.6 },
};

const STATE_SPEED_MUL: Record<VisualState, number> = { idle: 1, listening: 1.1, thinking: 1.8, speaking: 3 };
const STATE_SIZE_MUL: Record<VisualState, number> = { idle: 1, listening: 1.05, thinking: 1.1, speaking: 1.5 };
const STATE_RADIUS_MUL: Record<VisualState, number> = { idle: 1, listening: 0.9, thinking: 1, speaking: 1 };

interface Particle {
  layer: OrbLayer;
  colorGroup: ColorGroup;
  angle: number;
  baseRadius: number;
  speed: number;
  baseSize: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

function makeLayerParticles(layer: OrbLayer, count: number, radiusMin: number, radiusMax: number, speedMin: number, speedMax: number, sizeMin: number, sizeMax: number): Particle[] {
  return Array.from({ length: count }, () => {
    const colorGroup = pickColorGroup();
    const isStar = colorGroup === "white";
    return {
      layer,
      colorGroup,
      angle: Math.random() * Math.PI * 2,
      baseRadius: radiusMin + Math.random() * (radiusMax - radiusMin),
      speed: (speedMin + Math.random() * (speedMax - speedMin)) * (Math.random() < 0.5 ? 1 : -1) * 0.01,
      baseSize: isStar ? 3 + Math.random() * 3 : sizeMin + Math.random() * (sizeMax - sizeMin),
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.05,
    };
  });
}

function makeLivingParticles(): Particle[] {
  return [
    ...makeLayerParticles("core", 50, 20, 80, 0.8, 1.5, 1, 3),
    ...makeLayerParticles("mid", 100, 80, 180, 0.4, 0.9, 1, 3),
    ...makeLayerParticles("outer", 80, 180, 240, 0.2, 0.5, 1, 4),
  ];
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function useManilaClock(): { time: string; shiftLabel: ShiftLabel } {
  const [time, setTime] = useState("");
  const [shiftLabel, setShiftLabel] = useState<ShiftLabel>("☀️ DAY SHIFT");
  useEffect(() => {
    function tick() {
      const now = new Date();
      setTime(formatManilaTime(now));
      setShiftLabel(getManilaGreeting(now).shiftLabel);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return { time, shiftLabel };
}

export function JarvisHUD({ active }: { active: boolean }) {
  const [persona, setPersona] = useState<Persona>("jarvis");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [stats, setStats] = useState<JarvisStats | null>(null);
  const [birDeadlines, setBirDeadlines] = useState<BirDeadline[]>([]);
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [vitalsPulse, setVitalsPulse] = useState(false);
  const [toasts, setToasts] = useState<LiveToast[]>([]);
  const [, setClockTick] = useState(0); // forces "Updated Ns ago" to recompute every second

  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>(makeLivingParticles());
  const visualStateRef = useRef<VisualState>("idle");
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const hasOverdueRef = useRef(false);
  const orbPulseUntilRef = useRef(0);
  const prevStatsRef = useRef<JarvisStats | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const toastIdRef = useRef(0);

  const { time: manilaClock, shiftLabel } = useManilaClock();

  const visualState: VisualState = listening ? "listening" : speaking ? "speaking" : thinking ? "thinking" : "idle";
  useEffect(() => {
    visualStateRef.current = visualState;
  }, [visualState]);

  useEffect(() => {
    hasOverdueRef.current = birDeadlines.some((d) => d.status === "OVERDUE");
  }, [birDeadlines]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (stored === "friday" || stored === "jarvis") setPersona(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, persona);
  }, [persona]);

  function pushToast(message: string) {
    const id = ++toastIdRef.current;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TOAST_DURATION_MS);
  }

  function pulseVitalsNow() {
    setVitalsPulse(true);
    setTimeout(() => setVitalsPulse(false), VITALS_PULSE_DURATION_MS);
  }

  function pulseOrbNow() {
    orbPulseUntilRef.current = Date.now() + ORB_PULSE_DURATION_MS;
  }

  // Ticks the "Updated Ns ago" label every second without re-fetching anything.
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const loadStats = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/admin/jarvis?q=status&persona=${persona}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const newStats: JarvisStats = data.stats;
      const latestUsers: RecentSignup[] = data.latestUsers ?? [];
      const latestWaitlist: RecentSignup[] = data.latestWaitlist ?? [];

      // Delta detection against the last known snapshot — this is real
      // polling (every 10s), not a live Postgres CDC subscription: Supabase
      // Realtime's `postgres_changes` would need these tables readable by
      // the browser's `anon` role, but they're RLS-locked to service_role
      // only (waitlist emails, revenue, invoices) — opening that up so the
      // browser could subscribe would make all of it publicly readable via
      // the already-public anon key, which is a real data leak, not a
      // theoretical one. Polling + diffing gets the same "no refresh
      // needed, updates within ~10s" result without that trade-off.
      const prev = prevStatsRef.current;
      if (hasLoadedOnceRef.current && prev) {
        const events: string[] = [];
        let spokenLine: string | null = null;

        if (newStats.mrr > prev.mrr) {
          const line = `New subscription — MRR now PHP ${newStats.mrr.toLocaleString()}, Sir.`;
          events.push(line);
          spokenLine = spokenLine ?? line;
        }
        if (newStats.totalUsers > prev.totalUsers) {
          const who = latestUsers[0]?.email ? ` (${latestUsers[0].email})` : "";
          const line = `New user joined${who} — ${newStats.totalUsers} total now, Sir.`;
          events.push(line);
          spokenLine = spokenLine ?? `New user joined, Sir — ${newStats.totalUsers} total now.`;
        }
        if (newStats.totalWaitlist > prev.totalWaitlist) {
          const who = latestWaitlist[0]?.email ? ` (${latestWaitlist[0].email})` : "";
          const line = `New waitlist signup${who} — ${newStats.totalWaitlist} total, hate level ${newStats.avgHateLevel}.`;
          events.push(line);
          spokenLine = spokenLine ?? `New waitlist signup — ${newStats.totalWaitlist} total, hate level ${newStats.avgHateLevel}, Sir.`;
        }
        if (newStats.invoicesTotal > prev.invoicesTotal) {
          const line = `New invoice — ${newStats.invoicesTotal} total now.`;
          events.push(line);
          spokenLine = spokenLine ?? line;
        }

        if (events.length > 0) {
          for (const line of events) pushToast(`LIVE: ${line}`);
          pulseVitalsNow();
          pulseOrbNow();
          // Never interrupt an active mic/thinking/speaking moment with an unsolicited announcement.
          if (spokenLine && visualStateRef.current === "idle") {
            speak(spokenLine);
          }
        }
      }

      prevStatsRef.current = newStats;
      hasLoadedOnceRef.current = true;
      setStats(newStats);
      setBirDeadlines(data.birDeadlines ?? []);
      setElevenLabsConfigured(Boolean(data.elevenLabsConfigured));
      setLastSyncedAt(Date.now());
    } catch {
      // Vitals panel just stays on its last known values — not worth surfacing an error banner for a background refresh.
    } finally {
      setSyncing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  useEffect(() => {
    if (!active) return;
    loadStats();
    const id = setInterval(loadStats, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, loadStats]);

  // ---- Living orb (Canvas 2D, requestAnimationFrame): 3-layer multi-color
  // particle galaxy, trail/motion-blur, constellation connecting lines,
  // arc-reactor core pulse with rotating rays, state-reactive color
  // emphasis + speed + a BIR-overdue red tint. ----
  useEffect(() => {
    if (!active) return;
    const canvas = orbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    let t = 0;

    function frame() {
      if (!ctx) return;
      t += 1;
      const state = visualStateRef.current;
      const speedMul = STATE_SPEED_MUL[state];
      const sizeMul = STATE_SIZE_MUL[state];
      const radiusPulse = state === "speaking" ? 1 + 0.15 * Math.sin(t * 0.2) : 1;
      const radiusMul = STATE_RADIUS_MUL[state] * radiusPulse;

      // Trail / motion-blur instead of a hard clear — leaves faint streaks behind moving particles.
      ctx.fillStyle = "rgba(2,11,26,0.22)";
      ctx.fillRect(0, 0, size, size);

      // Arc-reactor core: pulsates faster while speaking, slower while idle.
      // A brief extra boost (liveBoost) rides on top when new real data just
      // arrived from the live-sync poll — decays back to 1 over ~1s.
      const pulsePeriod = state === "speaking" ? 30 : 120;
      const pulse = 0.5 + 0.5 * Math.sin((t / pulsePeriod) * Math.PI * 2);
      const msUntilPulseEnds = orbPulseUntilRef.current - Date.now();
      const liveBoost = msUntilPulseEnds > 0 ? 1 + 0.5 * (msUntilPulseEnds / ORB_PULSE_DURATION_MS) : 1;
      const coreRadius = (30 + pulse * 30) * sizeMul * liveBoost; // 30 -> 60px, briefly brighter on live updates
      const coreGradient = ctx.createRadialGradient(center, center, 0, center, center, coreRadius);
      coreGradient.addColorStop(0, "rgba(255,255,255,0.95)");
      coreGradient.addColorStop(0.4, "rgba(0,212,255,0.7)");
      coreGradient.addColorStop(0.75, "rgba(139,92,246,0.35)");
      coreGradient.addColorStop(1, "rgba(0,212,255,0)");
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(center, center, coreRadius, 0, Math.PI * 2);
      ctx.fill();

      // 8 slowly rotating light rays from the core.
      const rayCount = 8;
      const rayLength = 90 * sizeMul;
      const rayRotation = t * 0.01;
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(rayRotation);
      for (let i = 0; i < rayCount; i++) {
        const rayAngle = (i / rayCount) * Math.PI * 2;
        const grad = ctx.createLinearGradient(0, 0, Math.cos(rayAngle) * rayLength, Math.sin(rayAngle) * rayLength);
        grad.addColorStop(0, "rgba(0,212,255,0.25)");
        grad.addColorStop(1, "rgba(0,212,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(rayAngle) * rayLength, Math.sin(rayAngle) * rayLength);
        ctx.stroke();
      }
      ctx.restore();

      // Advance + compute screen positions for every particle first, so
      // the constellation pass below can check proximity between them.
      const positions = particlesRef.current.map((p) => {
        p.angle += p.speed * speedMul;
        p.twinklePhase += p.twinkleSpeed;
        const radius = p.baseRadius * radiusMul;
        const x = center + Math.cos(p.angle) * radius;
        const y = center + Math.sin(p.angle) * radius;
        const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(p.twinklePhase));
        const emphasis = STATE_EMPHASIS[state][p.colorGroup];
        return { x, y, p, twinkle, emphasis };
      });

      // Constellation lines — core+mid layers only (bounded cost), capped
      // total draws so a dense frame can't blow past a reasonable budget.
      const linkable = positions.filter((pos) => pos.p.layer !== "outer");
      let linesDrawn = 0;
      const maxLines = 220;
      for (let i = 0; i < linkable.length && linesDrawn < maxLines; i++) {
        for (let j = i + 1; j < linkable.length && linesDrawn < maxLines; j++) {
          const a = linkable[i];
          const b = linkable[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 3600) {
            // < 60px
            const [r1, g1, b1] = hexToRgb(PALETTE[a.p.colorGroup]);
            const [r2, g2, b2] = hexToRgb(PALETTE[b.p.colorGroup]);
            const mixR = Math.round((r1 + r2) / 2);
            const mixG = Math.round((g1 + g2) / 2);
            const mixB = Math.round((b1 + b2) / 2);
            ctx.strokeStyle = `rgba(${mixR},${mixG},${mixB},0.15)`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
            linesDrawn++;
          }
        }
      }

      // Particles themselves, on top of the constellation lines.
      for (const { x, y, p, twinkle, emphasis } of positions) {
        const finalSize = p.baseSize * sizeMul * Math.min(1.6, emphasis);
        ctx.beginPath();
        ctx.fillStyle = PALETTE[p.colorGroup];
        ctx.globalAlpha = Math.min(1, twinkle * emphasis);
        ctx.arc(x, y, finalSize, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // BIR-overdue warning tint — a soft red pulse over the whole orb.
      if (hasOverdueRef.current) {
        const warnPulse = 0.15 + 0.15 * Math.sin(t * 0.08);
        ctx.fillStyle = `rgba(255,0,64,${warnPulse})`;
        ctx.beginPath();
        ctx.arc(center, center, size / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active]);

  // ---- Waveform (real AnalyserNode for ElevenLabs blob audio, simulated for browser TTS) ----
  useEffect(() => {
    if (!active) return;
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf: number;
    const w = canvas.width;
    const h = canvas.height;

    function drawFlat() {
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = CYAN;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    function drawFrame() {
      if (!ctx) return;
      const analyser = analyserRef.current;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        const step = w / data.length;
        data.forEach((v, i) => {
          const y = (v / 255) * h;
          const x = i * step;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
      } else {
        // Browser speechSynthesis exposes no audio stream to analyze — simulate a plausible waveform instead.
        const bars = 48;
        for (let i = 0; i < bars; i++) {
          const x = (i / bars) * w;
          const y = h / 2 + Math.sin(i * 0.6 + Date.now() / 90) * (h / 2 - 4) * Math.random();
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      raf = requestAnimationFrame(drawFrame);
    }

    function loop() {
      if (visualStateRef.current === "speaking") drawFrame();
      else drawFlat();
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  const speakBrowser = useCallback(
    (text: string) => {
      const synth = getSpeechSynthesis();
      if (!synth) return;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
      const preferred =
        persona === "friday"
          ? voices.find((v) => /female|zira|samantha|victoria/i.test(v.name))
          : voices.find((v) => /daniel|male|david|guy|alex/i.test(v.name));
      if (preferred) utterance.voice = preferred;
      utterance.rate = persona === "friday" ? 1.0 : 0.95;
      utterance.pitch = persona === "friday" ? 1.1 : 0.85;
      utterance.onstart = () => setSpeaking(true);
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      synth.speak(utterance);
    },
    [persona],
  );

  const speak = useCallback(
    async (text: string) => {
      if (elevenLabsConfigured) {
        try {
          audioRef.current?.pause();
          setSpeaking(true);
          const voiceId = persona === "friday" ? FRIDAY_VOICE_ID : JARVIS_VOICE_ID;
          const res = await fetch("/api/admin/jarvis/speak", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, voiceId }),
          });
          if (!res.ok) throw new Error("ElevenLabs request failed");
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audioRef.current = audio;

          // Real frequency analysis — this blob is same-origin (fetched by
          // us, not a cross-origin <audio src>), so createMediaElementSource
          // works without CORS issues. Must reconnect to destination or the
          // audio goes silent, since routing through an analyser replaces
          // the element's default output path.
          if (!audioCtxRef.current) {
            audioCtxRef.current = new AudioContext();
          }
          const audioCtx = audioCtxRef.current;
          const source = audioCtx.createMediaElementSource(audio);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(audioCtx.destination);
          analyserRef.current = analyser;

          audio.onended = () => {
            setSpeaking(false);
            analyserRef.current = null;
          };
          audio.onerror = () => {
            setSpeaking(false);
            analyserRef.current = null;
          };
          await audio.play();
          return;
        } catch {
          setSpeaking(false);
          analyserRef.current = null;
        }
      }

      speakBrowser(text);
    },
    [elevenLabsConfigured, persona, speakBrowser],
  );

  const ask = useCallback(
    async (q: string) => {
      setError(null);
      setThinking(true);
      try {
        const res = await fetch(`/api/admin/jarvis?q=${encodeURIComponent(q)}&persona=${persona}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Jarvis couldn't answer that.");
          return;
        }
        setStats(data.stats);
        setBirDeadlines(data.birDeadlines ?? []);
        setElevenLabsConfigured(Boolean(data.elevenLabsConfigured));
        speak(data.voiceAnswer);
      } catch {
        setError("Network error — try again, Sir.");
      } finally {
        setThinking(false);
      }
    },
    [persona, speak],
  );

  function handleOrbClick() {
    if (listening) return;
    ask("report today");
  }

  function handleMicClick() {
    const SpeechRecognitionCtor = getSpeechRecognition();
    if (!SpeechRecognitionCtor) {
      setError("Voice input not supported in this browser, Sir — try Chrome.");
      setTimeout(() => setError(null), 3000);
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) ask(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  useEffect(
    () => () => {
      getSpeechSynthesis()?.cancel();
      audioRef.current?.pause();
    },
    [],
  );

  const vitals = useMemo(() => {
    if (!stats) return null;
    // Real MRR (active subscriptions, yearly/12) — not paymongoRevenue,
    // which is a lifetime payment total and would silently drift from the
    // true "monthly recurring" figure after the next renewal payment.
    return {
      users: stats.totalUsers,
      waitlist: stats.totalWaitlist,
      hatePct: Math.min(100, Math.round((stats.avgHateLevel / 10) * 100)),
      hateLevel: stats.avgHateLevel,
      mrr: stats.mrr,
      mrrPct: Math.min(100, Math.round((stats.mrr / 2000) * 100)), // 2000 is an arbitrary visual ceiling for the bar, not a real target
      invoices: stats.invoicesTotal,
      dtiCount: stats.dtiCount,
      dtiCertified: Boolean(stats.axlaDtiName),
      dtiName: stats.axlaDtiName,
    };
  }, [stats]);

  if (!active) return null;

  return (
    <div
      className={`${jetbrainsMono.className} relative min-h-[860px] overflow-hidden rounded-2xl border border-[#0A2A5A]`}
      style={{
        background: "#020B1A",
        backgroundImage:
          "linear-gradient(rgba(10,42,90,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(10,42,90,0.35) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Grid fade near orb center, so the galaxy pops against the background */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[900px] w-[900px] -translate-x-1/2 -translate-y-1/2"
        style={{ background: "radial-gradient(circle, #020B1A 30%, rgba(2,11,26,0) 65%)" }}
      />

      {/* Scanline overlay — lighter than before so the orb pops */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Top bar */}
      <div className="relative flex flex-wrap items-center justify-between gap-2 px-6 py-4 text-[#00D4FF]">
        <p className="text-xs tracking-widest">J.A.R.V.I.S. — JUST A RATHER VERY INTELLIGENT SYSTEM</p>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            {persona === "friday" ? "Eva Mode" : "Adam Mode"}
          </span>
          <span className="rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            {shiftLabel}
          </span>
          <p className="text-sm tabular-nums">MANILA {manilaClock} PHT</p>
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#00FF88]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF88]" />
            {syncing ? "Syncing..." : `Live Sync · ${secondsAgoLabel(lastSyncedAt)}`}
          </div>
        </div>
      </div>

      {/* Live-event toasts */}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-in fade-in max-w-xs rounded-lg border px-3 py-2 text-xs font-medium text-[#00FF88] shadow-lg"
            style={{ borderColor: "rgba(0,255,136,0.4)", background: "rgba(10,20,40,0.95)", boxShadow: "0 0 20px rgba(0,255,136,0.25)" }}
          >
            {t.message}
          </div>
        ))}
      </div>

      {/* Left panel — System Vitals (compact) */}
      <div
        className="absolute left-5 top-20 w-56 space-y-2.5 rounded-xl p-2 text-[#00D4FF] transition-all duration-500"
        style={
          vitalsPulse
            ? { background: "rgba(0,255,136,0.08)", boxShadow: "0 0 24px rgba(0,255,136,0.35)" }
            : { background: "transparent", boxShadow: "none" }
        }
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">System Vitals</p>
        <VitalRow label="Users" value={vitals ? String(vitals.users) : "—"} />
        <VitalBar label="Waitlist" value={vitals ? `${vitals.waitlist} (${vitals.hateLevel}/10 hate)` : "—"} pct={vitals?.hatePct ?? 0} color="#FF3B5C" />
        <VitalBar label="Revenue" value={vitals ? `PHP ${vitals.mrr.toLocaleString()} MRR` : "—"} pct={vitals?.mrrPct ?? 0} color={CYAN} />
        <VitalBar label="Invoices" value={vitals ? String(vitals.invoices) : "—"} pct={vitals ? Math.min(100, vitals.invoices * 10) : 0} color={GREEN} />
        <VitalRow
          label="DTI Kits"
          value={vitals ? `${vitals.dtiCount}${vitals.dtiCertified ? " PASSED" : ""}` : "—"}
          valueClassName={vitals?.dtiCertified ? "text-[#00FF88]" : "text-[#00D4FF]"}
        />

        {birDeadlines.length > 0 && (
          <div className="space-y-1.5 pt-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">BIR Deadlines</p>
            {birDeadlines.map((d) => (
              <DeadlineRow key={d.name} deadline={d} />
            ))}
          </div>
        )}
      </div>

      {/* Right panel — gauge + waveform */}
      <div className="absolute right-5 top-20 flex w-40 flex-col items-center gap-4">
        <OperationalGauge />
        <div className="w-full">
          <p className="mb-1 text-center text-[9px] uppercase tracking-widest text-white/50">Voice Waveform</p>
          <canvas ref={waveCanvasRef} width={160} height={50} className="w-full rounded border border-[#0A2A5A]" />
        </div>
      </div>

      {/* Center living orb */}
      <div className="flex min-h-[700px] items-center justify-center">
        <div
          className={`relative flex items-center justify-center transition-transform duration-500 ${speaking ? "scale-110" : "scale-100"}`}
          style={{ height: 560, width: 560 }}
        >
          <div
            className="absolute inset-0 rounded-full border-2 border-dashed opacity-50"
            style={{ borderColor: CYAN, animation: "jarvis-spin 20s linear infinite" }}
          />
          <div
            className="absolute rounded-full border-2 transition-all"
            style={{
              inset: 20,
              borderColor: listening ? GREEN : thinking ? "#8B5CF6" : CYAN,
              boxShadow: `0 0 100px rgba(0,212,255,0.5), 0 0 200px rgba(139,92,246,0.3)`,
            }}
          />
          <button type="button" onClick={handleOrbClick} aria-label="Ask Jarvis" className="absolute cursor-pointer rounded-full" style={{ inset: 30 }}>
            <canvas
              ref={orbCanvasRef}
              width={500}
              height={500}
              className="absolute inset-0 h-full w-full rounded-full"
              style={{ filter: "blur(0.5px) saturate(1.25)" }}
            />
          </button>
        </div>
      </div>

      {/* Bottom data card — minimal */}
      <div
        className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-xl border px-5 py-2.5 text-xs"
        style={{ borderColor: CYAN, boxShadow: `0 0 20px ${CYAN}44` }}
      >
        <span className="text-[#00D4FF]">
          AXLA LIVE: {vitals ? `PHP ${vitals.mrr.toLocaleString()} MRR` : "—"} | Users {vitals?.users ?? "—"} | Jarvis ON
        </span>
      </div>

      {/* Mic control */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        <button
          type="button"
          onClick={handleMicClick}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold transition ${
            listening ? "animate-pulse border-red-400 bg-red-500/20 text-red-200" : "border-[#00D4FF]/50 bg-[#00D4FF]/10 text-[#00D4FF]"
          }`}
        >
          <Mic className="h-3.5 w-3.5" />
          {listening ? "Listening, Sir..." : "Ask Jarvis, Sir"}
        </button>
        {error && <p className="max-w-xs text-center text-[10px] text-red-300">{error}</p>}
      </div>

      <style jsx>{`
        @keyframes jarvis-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

function VitalRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/60">{label}</span>
      <span className={`font-semibold ${valueClassName ?? "text-[#00D4FF]"}`}>{value}</span>
    </div>
  );
}

function VitalBar({ label, value, pct, color }: { label: string; value: string; pct: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/60">{label}</span>
        <span className="font-semibold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
      </div>
    </div>
  );
}

function DeadlineRow({ deadline }: { deadline: BirDeadline }) {
  const color = deadline.status === "OVERDUE" ? "#FF3B5C" : deadline.status === "WARNING" ? "#FFB020" : GREEN;
  const pct = deadline.status === "OVERDUE" ? 100 : Math.max(5, 100 - Math.min(100, deadline.daysLeft * 4));
  const dateLabel = new Date(`${deadline.date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const daysLabel = deadline.status === "OVERDUE" ? `${Math.abs(deadline.daysLeft)}d overdue` : `${deadline.daysLeft}d left`;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px]">
        <span className="truncate text-white/60" title={deadline.name}>
          {deadline.name}
        </span>
        <span className={`shrink-0 font-semibold ${deadline.status === "OVERDUE" ? "animate-pulse" : ""}`} style={{ color }}>
          {dateLabel} · {daysLabel}
          {deadline.status === "OVERDUE" ? " ⚠️" : deadline.status === "WARNING" ? " ⚠️" : ""}
        </span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${deadline.status === "OVERDUE" ? "animate-pulse" : ""}`}
          style={{ width: `${pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
        />
      </div>
    </div>
  );
}

function OperationalGauge() {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg width={80} height={80} className="-rotate-90">
        <circle cx={40} cy={40} r={radius} stroke="rgba(255,255,255,0.1)" strokeWidth={5} fill="none" />
        <circle
          cx={40}
          cy={40}
          r={radius}
          stroke={CYAN}
          strokeWidth={5}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={0}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${CYAN})` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[9px] font-bold text-white/70">OPERATIONAL</span>
        <span className="text-sm font-bold text-[#00D4FF]">100%</span>
      </div>
    </div>
  );
}
