"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JetBrains_Mono } from "next/font/google";
import { Mic } from "lucide-react";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"] });

type Persona = "jarvis" | "friday";

const JARVIS_VOICE_ID = "pFZP5JQG7iQjIQuC4Bku"; // "Adam" / Jarvis Male
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
  dtiCount: number;
  axlaDtiName: string | null;
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

interface Particle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  color: string;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 40 + Math.random() * 90,
    speed: (0.002 + Math.random() * 0.006) * (Math.random() < 0.5 ? 1 : -1),
    size: 1 + Math.random() * 2,
    color: Math.random() < 0.7 ? CYAN : GREEN,
  }));
}

function useLiveClock(): string {
  const [time, setTime] = useState("");
  useEffect(() => {
    function tick() {
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function JarvisHUD({ active }: { active: boolean }) {
  const [persona, setPersona] = useState<Persona>("jarvis");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [subtitle, setSubtitle] = useState("");
  const [showSubtitle, setShowSubtitle] = useState(false);
  const [stats, setStats] = useState<JarvisStats | null>(null);
  const [elevenLabsConfigured, setElevenLabsConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orbCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>(makeParticles(180));
  const speakingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const subtitleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typewriterRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clock = useLiveClock();

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    if (stored === "friday" || stored === "jarvis") setPersona(stored);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(PERSONA_STORAGE_KEY, persona);
  }, [persona]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/jarvis?q=status&persona=${persona}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setStats(data.stats);
      setElevenLabsConfigured(Boolean(data.elevenLabsConfigured));
    } catch {
      // Vitals panel just stays on its last known values — not worth surfacing an error banner for a background refresh.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persona]);

  useEffect(() => {
    if (!active) return;
    loadStats();
    const id = setInterval(loadStats, 30_000);
    return () => clearInterval(id);
  }, [active, loadStats]);

  // ---- Orb particle system (Canvas 2D, requestAnimationFrame) ----
  useEffect(() => {
    if (!active) return;
    const canvas = orbCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      const isSpeaking = speakingRef.current;
      const speedMul = isSpeaking ? 2 : 1;
      const sizeMul = isSpeaking ? 1.5 : 1;

      // Center glow
      const glowRadius = isSpeaking ? 34 : 22;
      const gradient = ctx.createRadialGradient(center, center, 0, center, center, glowRadius);
      gradient.addColorStop(0, isSpeaking ? "rgba(255,255,255,0.9)" : "rgba(0,212,255,0.7)");
      gradient.addColorStop(1, "rgba(0,212,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(center, center, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      for (const p of particlesRef.current) {
        p.angle += p.speed * speedMul;
        const x = center + Math.cos(p.angle) * p.radius;
        const y = center + Math.sin(p.angle) * p.radius;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.85;
        ctx.arc(x, y, p.size * sizeMul, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

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
      if (speakingRef.current) drawFrame();
      else drawFlat();
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  function typewrite(text: string) {
    if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
    if (typewriterRef.current) clearTimeout(typewriterRef.current);
    setShowSubtitle(true);
    setSubtitle("");
    let i = 0;
    function step() {
      i += 1;
      setSubtitle(text.slice(0, i));
      if (i < text.length) {
        typewriterRef.current = setTimeout(step, 18);
      } else {
        subtitleTimeoutRef.current = setTimeout(() => setShowSubtitle(false), 5000);
      }
    }
    step();
  }

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
      typewrite(text);

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
      try {
        const res = await fetch(`/api/admin/jarvis?q=${encodeURIComponent(q)}&persona=${persona}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Jarvis couldn't answer that.");
          return;
        }
        setStats(data.stats);
        setElevenLabsConfigured(Boolean(data.elevenLabsConfigured));
        speak(data.voiceAnswer);
      } catch {
        setError("Network error — try again, Boss.");
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
      setError("Voice input not supported in this browser, Boss — try Chrome.");
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
      if (subtitleTimeoutRef.current) clearTimeout(subtitleTimeoutRef.current);
      if (typewriterRef.current) clearTimeout(typewriterRef.current);
      getSpeechSynthesis()?.cancel();
      audioRef.current?.pause();
    },
    [],
  );

  const vitals = useMemo(() => {
    if (!stats) return null;
    const totalRevenue = stats.paymongoRevenue + stats.invoicesPaidTotal;
    return {
      users: stats.totalUsers,
      waitlist: stats.totalWaitlist,
      hatePct: Math.min(100, Math.round((stats.avgHateLevel / 10) * 100)),
      hateLevel: stats.avgHateLevel,
      revenue: totalRevenue,
      revenuePct: Math.min(100, Math.round((totalRevenue / 2000) * 100)), // 2000 is an arbitrary visual ceiling for the bar, not a real target
      invoices: stats.invoicesTotal,
      dtiCount: stats.dtiCount,
      dtiCertified: Boolean(stats.axlaDtiName),
      dtiName: stats.axlaDtiName,
    };
  }, [stats]);

  if (!active) return null;

  return (
    <div
      className={`${jetbrainsMono.className} relative min-h-[700px] overflow-hidden rounded-2xl border border-[#0A2A5A]`}
      style={{
        background: "#020B1A",
        backgroundImage:
          "linear-gradient(rgba(10,42,90,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(10,42,90,0.35) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Scanline overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0px, transparent 1px, transparent 3px)",
        }}
      />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-4 text-[#00D4FF]">
        <p className="text-xs tracking-widest">J.A.R.V.I.S. — JUST A RATHER VERY INTELLIGENT SYSTEM</p>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-[#00D4FF]/40 bg-[#00D4FF]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
            {persona === "friday" ? "Eva Mode" : "Adam Mode"}
          </span>
          <p className="text-sm tabular-nums">{clock}</p>
        </div>
      </div>

      {/* Left panel — System Vitals */}
      <div className="absolute left-5 top-20 w-56 space-y-3 text-[#00D4FF]">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">System Vitals</p>
        <VitalRow label="Users" value={vitals ? String(vitals.users) : "—"} />
        <VitalBar label="Waitlist" value={vitals ? `${vitals.waitlist} (${vitals.hateLevel}/10 hate)` : "—"} pct={vitals?.hatePct ?? 0} color="#FF3B5C" />
        <VitalBar label="Revenue" value={vitals ? `PHP ${vitals.revenue.toLocaleString()} MRR` : "—"} pct={vitals?.revenuePct ?? 0} color={CYAN} />
        <VitalBar label="Invoices" value={vitals ? String(vitals.invoices) : "—"} pct={vitals ? Math.min(100, vitals.invoices * 10) : 0} color={GREEN} />
        <VitalRow
          label="DTI Kits"
          value={vitals ? `${vitals.dtiCount}${vitals.dtiCertified ? " PASSED" : ""}` : "—"}
          valueClassName={vitals?.dtiCertified ? "text-[#00FF88]" : "text-[#00D4FF]"}
        />
      </div>

      {/* Right panel — gauge + waveform */}
      <div className="absolute right-5 top-20 flex w-40 flex-col items-center gap-4">
        <OperationalGauge />
        <div className="w-full">
          <p className="mb-1 text-center text-[9px] uppercase tracking-widest text-white/50">Voice Waveform</p>
          <canvas ref={waveCanvasRef} width={160} height={50} className="w-full rounded border border-[#0A2A5A]" />
        </div>
      </div>

      {/* Center orb */}
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="relative flex h-72 w-72 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-2 border-dashed opacity-60"
            style={{ borderColor: CYAN, animation: "jarvis-spin 20s linear infinite" }}
          />
          <div
            className={`absolute inset-8 rounded-full border-2 transition-transform ${speaking ? "scale-110" : "scale-100"}`}
            style={{ borderColor: CYAN, boxShadow: `0 0 30px ${CYAN}` }}
          />
          <button
            type="button"
            onClick={handleOrbClick}
            aria-label="Ask Jarvis"
            className="absolute inset-16 cursor-pointer rounded-full"
          >
            <canvas ref={orbCanvasRef} width={288} height={288} className="absolute inset-0 -m-16 h-72 w-72" />
          </button>
        </div>
      </div>

      {/* Subtitle */}
      {showSubtitle && (
        <div className="pointer-events-none absolute bottom-28 left-1/2 w-full max-w-2xl -translate-x-1/2 px-6 text-center">
          <p className="text-lg font-medium text-white drop-shadow-[0_0_8px_rgba(0,212,255,0.6)]">{subtitle}</p>
        </div>
      )}

      {/* Bottom data card */}
      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 rounded-xl border px-5 py-2.5 text-xs" style={{ borderColor: CYAN, boxShadow: `0 0 20px ${CYAN}44` }}>
        <span className="text-[#00D4FF]">
          AXLA LIVE: {vitals ? `PHP ${vitals.revenue.toLocaleString()} MRR` : "—"} | Users {vitals?.users ?? "—"} | Boss Mode ON
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
          {listening ? "Listening, Boss..." : "Ask Jarvis, Boss"}
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
