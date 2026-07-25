"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { JetBrains_Mono } from "next/font/google";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { formatManilaTime } from "@/lib/manila-time";

const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500", "700"] });

const CYAN = "#00D4FF";

// ---- Ambient background orb — a simplified, non-interactive cousin of the
// Jarvis Command Center's living orb: same visual language, far fewer
// particles and no state-reactivity, since this is just a watermark behind
// the login card, not something to click or listen to. ----
interface BgParticle {
  angle: number;
  radius: number;
  speed: number;
  size: number;
  color: string;
}

const BG_PALETTE = [CYAN, "#00FF88", "#8B5CF6"];

function makeBgParticles(count: number): BgParticle[] {
  return Array.from({ length: count }, () => ({
    angle: Math.random() * Math.PI * 2,
    radius: 60 + Math.random() * 300,
    speed: (0.05 + Math.random() * 0.15) * 0.01 * (Math.random() < 0.5 ? 1 : -1),
    size: 1 + Math.random() * 2.5,
    color: BG_PALETTE[Math.floor(Math.random() * BG_PALETTE.length)],
  }));
}

function BackgroundOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<BgParticle[]>(makeBgParticles(110));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = canvas.width;
    const center = size / 2;
    let raf: number;

    function frame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      for (const p of particlesRef.current) {
        p.angle += p.speed;
        const x = center + Math.cos(p.angle) * p.radius;
        const y = center + Math.sin(p.angle) * p.radius;
        ctx.beginPath();
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.6;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={800}
      height={800}
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.15]"
      style={{ filter: "blur(1px)" }}
    />
  );
}

function useManilaClock(): string {
  const [time, setTime] = useState("");
  useEffect(() => {
    function tick() {
      setTime(formatManilaTime(new Date()));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const manilaClock = useManilaClock();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Incorrect password.");
        setLoading(false);
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      className={`${jetbrainsMono.className} relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10`}
      style={{
        background: "#020B1A",
        backgroundImage:
          "linear-gradient(rgba(10,42,90,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(10,42,90,0.3) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* Ambient living-orb watermark */}
      <BackgroundOrb />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(circle, transparent 35%, #020B1A 90%)" }}
      />

      {/* Scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #ffffff 0px, transparent 1px, transparent 3px)" }}
      />

      {/* Login card */}
      <div
        className="relative z-10 w-full max-w-[480px] rounded-2xl border p-8 sm:p-10"
        style={{
          background: "rgba(10,20,40,0.85)",
          borderColor: "rgba(0,212,255,0.4)",
          boxShadow: "0 0 40px rgba(0,212,255,0.2)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4">
            <div
              className="absolute inset-0 rounded-2xl"
              style={{ boxShadow: `0 0 30px ${CYAN}`, animation: "vault-pulse 2.5s ease-in-out infinite" }}
            />
            <Image src="/axla-app-icon.png" alt="Axla" width={64} height={64} className="relative rounded-2xl" priority />
          </div>

          <h1 className="text-2xl font-bold tracking-wide text-white">AXLA ADMIN</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest" style={{ color: CYAN }}>
            Jarvis Command Access
          </p>
          <p className="mt-3 text-xs tabular-nums text-white/50">MANILA {manilaClock} PHT</p>

          <div className="mt-4 flex items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-3 py-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF88]" />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#00FF88]">Vault Secure — Biometric Ready</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label htmlFor="password" className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-white/60">
              Access Code
            </label>
            <div
              className="relative overflow-hidden rounded-xl border transition-all"
              style={{
                borderColor: focused ? CYAN : "#1E3A5F",
                boxShadow: focused ? `0 0 20px rgba(0,212,255,0.35)` : "none",
              }}
            >
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Enter vault code, Sir..."
                className="h-[52px] w-full bg-[#020B1A] px-4 pr-12 text-base text-white placeholder:text-white/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide access code" : "Show access code"}
                className="absolute right-0 top-0 flex h-[52px] w-12 items-center justify-center text-white/40 hover:text-white"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="rounded-xl border px-4 py-3 text-sm font-medium"
              style={{ borderColor: "rgba(255,59,92,0.4)", background: "rgba(255,59,92,0.08)", color: "#FF3B5C" }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest">Access Denied</p>
              <p className="mt-0.5 text-white/80">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="group flex h-[52px] w-full items-center justify-center gap-2 rounded-xl text-sm font-bold uppercase tracking-wide text-[#001A0D] transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            style={{
              background: "linear-gradient(90deg, #00FF88, #00D4FF)",
              boxShadow: "0 0 25px rgba(0,255,136,0.35)",
            }}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Authenticating...
              </>
            ) : (
              "Access Jarvis, Sir"
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-[10px] uppercase tracking-widest text-white/30">Restricted Access — Authorized Personnel Only</p>
      </div>

      <style jsx>{`
        @keyframes vault-pulse {
          0%,
          100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.9;
            transform: scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
