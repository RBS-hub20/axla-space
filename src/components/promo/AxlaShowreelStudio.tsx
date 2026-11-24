"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PROMO, isPromoActive } from "@/lib/promo";
import { buildLofiLoopBuffer, schedulePop } from "@/lib/promo/lofi-audio";
import { generateAxlaQrDataUrl } from "@/lib/promo/qr";
import { AXLA_PROMO_COPY } from "@/lib/promo/copy";

/**
 * 1920x1080 canvas "showreel" studio for Axla TaxLaya: a Web-Audio-driven
 * timeline plays 5 real ElevenLabs VO lines (public/audio/axla-vo-line*.mp3)
 * back to back, each line is its own scene, and the canvas renders real
 * product copy/colors as hand-built device mockups (same "mockup, not a
 * screenshot" convention as TaxLayaPromoVideo.tsx) in sync with the audio.
 *
 * The background bed and the scene-cut "pop" are synthesized in
 * lib/promo/lofi-audio.ts — placeholder music/SFX built from oscillators,
 * not a licensed "Pinoy lo-fi" track or sampled foley. Swap that file's
 * render for a real licensed bed later; nothing else depends on it.
 *
 * Durations are read from the decoded VO files themselves (buffer.duration)
 * rather than hardcoded — ElevenLabs' natural delivery doesn't land on the
 * script's planned 3/5/8/5/4s beats, so the actual total runs longer than
 * 25s. The timeline adapts to whatever the real files measure; nothing here
 * assumes a fixed 25.000s length.
 */

const VO_LINES = [
  { src: "/audio/axla-vo-line1.mp3", caption: "Freelancer ka ba? Nalilito sa BIR? RDO? 1701?", visual: "problem1" as const },
  { src: "/audio/axla-vo-line2.mp3", caption: "Nakaka-stress diba? Pila sa RDO, takot sa penalty?", visual: "problem2" as const },
  {
    src: "/audio/axla-vo-line3.mp3",
    caption: "Meet Axla! May TaxLaya Agent — RDO Runner mo! Two minutes lang — OTP, upload, filed na! No pila, no stress, BIR compliant!",
    visual: "solution" as const,
  },
  { src: "/audio/axla-vo-line4.mp3", caption: `At launch promo — ₱${PROMO.proPricePesos} lang per month! From ₱499! No credit card needed!`, visual: "pricing" as const },
  { src: "/audio/axla-vo-line5.mp3", caption: "Install Axla App now — axla.space — BIR filing, no stress!", visual: "cta" as const },
];

const PRE_ROLL = 0.3;
const GAP = 0.25;
const OUTRO_HOLD = 1.0;

const BG = "#0B0F1A";
const ACCENT = "#00FF88";
const CARD = "#141A2A";
const BORDER = "#1E293B";

// Single source of truth for the bottom-of-frame "safe zone": the caption
// box and the waveform strip both live here, so every scene keeps its own
// content above (h - SCENE_SAFE_BOTTOM_MARGIN) instead of each re-deriving
// its own "how far from the edge" number by eyeballing one caption's wrap
// count (that's exactly how the caption/QR-box/badges-row collisions
// happened before — four independent constants, none aware of the others).
const CAPTION_BOTTOM_MARGIN = 60;
const CAPTION_LINE_HEIGHT = 46;
const CAPTION_BOX_PADDING = 28;
const CAPTION_MAX_LINES = 3; // generous upper bound for any caption string at 34px/72%-width wrap
const CAPTION_MAX_BOX_H = CAPTION_MAX_LINES * CAPTION_LINE_HEIGHT + CAPTION_BOX_PADDING;
const SCENE_SAFE_BOTTOM_MARGIN = CAPTION_BOTTOM_MARGIN + CAPTION_MAX_BOX_H + 24;

interface SceneBound {
  start: number;
  end: number;
}

function buildSceneBounds(durations: number[]): { bounds: SceneBound[]; total: number } {
  const bounds: SceneBound[] = [];
  let t = PRE_ROLL;
  for (const d of durations) {
    bounds.push({ start: t, end: t + d });
    t += d + GAP;
  }
  return { bounds, total: t - GAP + OUTRO_HOLD };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

type Images = { icon512: HTMLImageElement; icon192: HTMLImageElement; qr: HTMLImageElement };

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, elapsed: number, reduced: boolean) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0B0F1A");
  grad.addColorStop(1, "#0F1F15");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  if (reduced) return;
  const n = 22;
  for (let i = 0; i < n; i++) {
    const speed = 0.12 + (i % 5) * 0.03;
    const phase = i * 1.37;
    const x = ((Math.sin(elapsed * speed + phase) + 1) / 2) * w;
    const y = ((Math.cos(elapsed * speed * 0.7 + phase * 1.3) + 1) / 2) * h;
    const r = 2 + (i % 4) * 1.5;
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.1 * Math.sin(elapsed * 0.6 + phase);
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 18;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawWaveform(ctx: CanvasRenderingContext2D, data: Uint8Array<ArrayBuffer>, w: number, h: number) {
  const barCount = 64;
  const step = Math.floor(data.length / barCount);
  const baseY = h - 26;
  const maxBarH = 30;
  const barW = (w - 160) / barCount - 3;
  ctx.save();
  for (let i = 0; i < barCount; i++) {
    const v = (data[i * step] - 128) / 128; // -1..1
    const amp = Math.min(1, Math.abs(v) * 2.2);
    const barH = Math.max(3, amp * maxBarH);
    const x = 80 + i * ((w - 160) / barCount);
    ctx.fillStyle = ACCENT;
    ctx.globalAlpha = 0.25 + amp * 0.55;
    roundRect(ctx, x, baseY - barH / 2, Math.max(2, barW), barH, 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDeviceFrame(ctx: CanvasRenderingContext2D, kind: "phone" | "laptop", x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = BORDER;
  const r = kind === "phone" ? 42 : 18;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  const bezel = 10;
  ctx.fillStyle = BG;
  roundRect(ctx, x + bezel, y + bezel, w - bezel * 2, h - bezel * 2, Math.max(4, r - bezel));
  ctx.fill();

  if (kind === "phone") {
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    roundRect(ctx, x + w / 2 - 40, y + 20, 80, 10, 5);
    ctx.fill();
  }
}

function drawHeadline(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") {
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * size * 1.15));
}

function drawPill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fg: string, bg: string, border: string) {
  ctx.font = `700 26px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const paddingX = 28;
  const textW = ctx.measureText(text).width;
  const w = textW + paddingX * 2;
  const h = 54;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + paddingX, y + h / 2 + 1);
  return w;
}

const CAPTION_FONT = `700 ${CAPTION_LINE_HEIGHT - 12}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

interface CaptionLayout {
  text: string;
  lines: string[];
  boxH: number;
}

/** Wraps caption text into lines once per distinct string — callers cache the result and only recompute when the text changes, instead of re-running this on every animation frame. */
function measureCaptionLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): CaptionLayout {
  ctx.font = CAPTION_FONT;
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return { text, lines, boxH: lines.length * CAPTION_LINE_HEIGHT + CAPTION_BOX_PADDING };
}

/** Draws a pre-measured caption, anchored to a fixed distance from the bottom edge (not relative to whatever a scene draws above it) — see SCENE_SAFE_BOTTOM_MARGIN. */
function drawCaption(ctx: CanvasRenderingContext2D, layout: CaptionLayout, w: number, h: number) {
  const maxWidth = w * 0.72;
  const boxY = h - CAPTION_BOTTOM_MARGIN - layout.boxH;
  ctx.fillStyle = "rgba(0,0,0,0.68)";
  roundRect(ctx, w / 2 - maxWidth / 2 - 24, boxY, maxWidth + 48, layout.boxH, 16);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = CAPTION_FONT;
  ctx.textAlign = "center";
  layout.lines.forEach((l, i) => ctx.fillText(l, w / 2, boxY + 36 + i * CAPTION_LINE_HEIGHT));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function drawSceneProblem1(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, reduced: boolean) {
  const shakeX = reduced ? 0 : Math.sin(t * 22) * Math.max(0, 1 - t) * 6;
  ctx.save();
  ctx.fillStyle = `rgba(220,38,38,${0.08 + 0.05 * Math.sin(t * 3)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const lx = w / 2 - 300 + shakeX;
  const ly = h / 2 - 230;
  drawDeviceFrame(ctx, "laptop", lx, ly, 600, 360);

  const forms = ["2551Q", "1701Q", "RDO Form", "Penalty?"];
  const cardW = 260;
  const cardH = 80;
  forms.forEach((label, i) => {
    const cx = lx + 40 + (i % 2) * (cardW + 20);
    const cy = ly + 40 + Math.floor(i / 2) * (cardH + 16);
    ctx.save();
    ctx.translate(cx + cardW / 2, cy + cardH / 2);
    ctx.rotate((i % 2 === 0 ? -1 : 1) * 0.04);
    ctx.translate(-(cx + cardW / 2), -(cy + cardH / 2));
    ctx.fillStyle = "rgba(239,68,68,0.12)";
    ctx.strokeStyle = "rgba(248,113,113,0.5)";
    ctx.lineWidth = 2;
    roundRect(ctx, cx, cy, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fca5a5";
    ctx.font = `700 24px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(label, cx + 20, cy + cardH / 2 + 8);
    ctx.restore();
  });

  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, lx + 40, ly + 220, cardW * 2 + 20, 64, 12);
  ctx.fill();
  ctx.fillStyle = "#94a3b8";
  ctx.font = `500 22px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("RDO pila: 47 ahead… 😩", lx + 60, ly + 258);

  drawHeadline(ctx, ["BIR? RDO? 1701?", "Nakakalito?"], w / 2, h / 2 + 290, 64, "#ffffff", "center");
}

function drawSceneProblem2(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, reduced: boolean) {
  ctx.save();
  ctx.fillStyle = `rgba(220,38,38,${0.06 + 0.04 * Math.sin(t * 2.4)})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const items = [
    { label: "Pila sa RDO", emoji: "🧍🧍🧍" },
    { label: "Deadline stress", emoji: "⏰" },
    { label: "Takot sa penalty", emoji: "⚠️" },
  ];
  const cardW = 380;
  const gap = 48;
  const startX = w / 2 - (cardW * 3 + gap * 2) / 2;
  items.forEach((item, i) => {
    const bob = reduced ? 0 : Math.sin(t * 2 + i) * 6;
    const x = startX + i * (cardW + gap);
    const y = h / 2 - 140 + bob;
    ctx.fillStyle = CARD;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, cardW, 260, 24);
    ctx.fill();
    ctx.stroke();
    ctx.font = `64px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(item.emoji, x + cardW / 2, y + 120);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `700 30px system-ui, sans-serif`;
    ctx.fillText(item.label, x + cardW / 2, y + 200);
  });

  drawHeadline(ctx, ["Nakaka-stress, diba?"], w / 2, h / 2 + 220, 58, "#fca5a5", "center");
}

// The solution scene's sub-beats (icon pop → phone slide-in → badges reveal)
// were tuned by eye against this scene's real measured VO duration (line 3,
// ~11.42s at the time of writing). They're expressed below as fractions of
// that tuned duration and then scaled by the *actual* scene duration passed
// in, so regenerating the VO line to a different length rescales the beats
// instead of silently desyncing them (cutting phones off early, or leaving
// dead air before the next scene).
const SOLUTION_SCENE_TUNED_DURATION = 11.42;

function drawSceneSolution(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, images: Images, duration: number) {
  const scale = duration > 0 ? duration / SOLUTION_SCENE_TUNED_DURATION : 1;
  const introEnd = 3.2 * scale;
  const introPop = 1.2 * scale;
  const introFadeStart = introEnd - 0.6 * scale;

  const introT = Math.min(1, t / introPop);
  const popScale = 0.6 + 0.4 * easeOutCubic(introT);
  const introAlpha = introT;

  if (t < introEnd) {
    ctx.save();
    ctx.globalAlpha = introAlpha * (t > introFadeStart ? Math.max(0, 1 - (t - introFadeStart) / (0.6 * scale)) : 1);
    ctx.translate(w / 2, h / 2 - 60);
    ctx.scale(popScale, popScale);
    ctx.shadowColor = ACCENT;
    ctx.shadowBlur = 80;
    ctx.drawImage(images.icon512, -90, -90, 180, 180);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = introAlpha;
    drawHeadline(ctx, ["Meet Axla"], w / 2, h / 2 + 150, 72, ACCENT, "center");
    ctx.font = `600 32px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "#cbd5e1";
    ctx.fillText("Your TaxLaya Agent — RDO Runner", w / 2, h / 2 + 200);
    ctx.restore();
    return;
  }

  const phaseT = t - (introEnd - 0.2 * scale);
  const slideT = Math.min(1, phaseT / (0.8 * scale));
  const slide = easeOutCubic(slideT);

  drawPill(ctx, "⏱ 2-min setup", w / 2 - 110, 140, ACCENT, "rgba(0,255,136,0.08)", "rgba(0,255,136,0.3)");

  const phoneW = 280;
  const phoneH = 420;
  const gap = 60;
  const totalW = phoneW * 3 + gap * 2;
  const startX = w / 2 - totalW / 2;
  const y = 270;

  const screens: { title: string; sub: string }[] = [
    { title: "Enter code", sub: "OTP sent to your email" },
    { title: AXLA_PROMO_COPY.gcashSyncedTitle, sub: AXLA_PROMO_COPY.gcashSyncedSubtitle },
    { title: AXLA_PROMO_COPY.filedLabel, sub: "BIR compliant" },
  ];

  screens.forEach((s, i) => {
    const delay = i * 0.25;
    const localT = Math.max(0, Math.min(1, (slide - delay) / (1 - delay || 1)));
    const x = startX + i * (phoneW + gap) + (1 - localT) * 120;
    const alpha = localT;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawDeviceFrame(ctx, "phone", x, y, phoneW, phoneH);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 30px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(s.title, x + phoneW / 2, y + phoneH / 2 - 10);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 20px system-ui, sans-serif`;
    ctx.fillText(s.sub, x + phoneW / 2, y + phoneH / 2 + 26);
    if (i < 2) {
      ctx.fillStyle = ACCENT;
      ctx.beginPath();
      ctx.arc(x + phoneW / 2, y + phoneH / 2 + 70, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = BG;
      ctx.font = `700 20px system-ui, sans-serif`;
      ctx.fillText("✓", x + phoneW / 2, y + phoneH / 2 + 77);
    }
    ctx.restore();
  });

  const badgeDelay = 1.2 * scale;
  if (phaseT > badgeDelay) {
    const badgeAlpha = Math.min(1, (phaseT - badgeDelay) / (0.6 * scale));
    ctx.save();
    ctx.globalAlpha = badgeAlpha;
    const badges = ["No credit card", "BIR compliant", "2-min setup"];
    ctx.font = `600 24px system-ui, sans-serif`;
    let bx = w / 2 - 420;
    const by = h - SCENE_SAFE_BOTTOM_MARGIN - 50;
    badges.forEach((b) => {
      const bw = ctx.measureText(b).width + 56;
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      roundRect(ctx, bx, by, bw, 50, 25);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      ctx.textAlign = "left";
      ctx.fillText(b, bx + 28, by + 33);
      bx += bw + 20;
    });
    ctx.restore();
  }
}

function drawScenePricing(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, promoActive: boolean, daysLeft: number, reduced: boolean) {
  const popScale = 0.85 + Math.min(1, t / 0.5) * 0.15;
  const pulse = reduced ? 1 : 1 + Math.sin(t * 2.6) * 0.03;

  if (!reduced) {
    for (let i = 0; i < 24; i++) {
      const fall = (t * 0.35 + i * 0.07) % 1.2;
      const x = w / 2 - 500 + ((i * 919) % 1000);
      const y = fall * h;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - fall);
      ctx.fillStyle = i % 3 === 0 ? ACCENT : i % 3 === 1 ? "#ffffff" : "#FFD166";
      ctx.translate(x, y);
      ctx.rotate(fall * 8);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }
  }

  const badgeText = promoActive ? `⏳ ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : "🚀 Launch Offer";
  const badgeColor = promoActive ? "#fbbf24" : ACCENT;
  ctx.textAlign = "center";
  ctx.font = `700 26px system-ui, sans-serif`;
  const badgeW = ctx.measureText(badgeText).width + 56;
  drawPill(ctx, badgeText, w / 2 - badgeW / 2, 150, badgeColor, `${badgeColor}22`, `${badgeColor}55`);

  ctx.save();
  ctx.translate(w / 2, h / 2 - 20);
  ctx.scale(popScale * pulse, popScale * pulse);

  ctx.fillStyle = "#64748b";
  ctx.font = `600 32px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("₱499/mo", 0, -70);
  ctx.save();
  ctx.strokeStyle = "#64748b";
  ctx.lineWidth = 3;
  const strikeW = ctx.measureText("₱499/mo").width;
  ctx.beginPath();
  ctx.moveTo(-strikeW / 2, -82);
  ctx.lineTo(strikeW / 2, -82);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = ACCENT;
  ctx.font = `800 120px system-ui, sans-serif`;
  ctx.fillText(`₱${PROMO.proPricePesos}`, 0, 50);
  ctx.font = `600 32px system-ui, sans-serif`;
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("/mo", 170, 50);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px system-ui, sans-serif`;
  ctx.fillText(`50% OFF — code ${PROMO.code}`, 0, 110);
  ctx.restore();

  const btnW = 420;
  const btnH = 90;
  ctx.save();
  ctx.translate(w / 2, h - SCENE_SAFE_BOTTOM_MARGIN - btnH / 2);
  ctx.scale(pulse, pulse);
  ctx.shadowColor = ACCENT;
  ctx.shadowBlur = 40;
  ctx.fillStyle = ACCENT;
  roundRect(ctx, -btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#001A29";
  ctx.font = `800 34px system-ui, sans-serif`;
  ctx.fillText("Claim 50% OFF", 0, 11);
  ctx.restore();
}

function drawSceneCta(ctx: CanvasRenderingContext2D, t: number, w: number, h: number, images: Images) {
  const slide = easeOutCubic(Math.min(1, t / 0.6));

  // End-card wordmark up top, clear of the device row below.
  const headAlpha = Math.min(1, t / 0.4);
  ctx.save();
  ctx.globalAlpha = headAlpha;
  ctx.drawImage(images.icon192, w / 2 - 160, 90, 56, 56);
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 48px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("axla.space", w / 2 - 90, 132);
  ctx.restore();

  // Three columns (phone / QR / Android install card) all share one row so
  // nothing stacks down into the caption band at the bottom of frame.
  const phoneW = 260;
  const androidW = 320;
  const qrBoxSize = 280;
  const colGap = 60;
  const totalW = phoneW + colGap + qrBoxSize + colGap + androidW;
  const startX = w / 2 - totalW / 2;
  const rowCenterY = 470;
  const rowH = 460;
  const py = rowCenterY - rowH / 2;

  const leftX = startX - (1 - slide) * 140;
  drawDeviceFrame(ctx, "phone", leftX, py, phoneW, rowH);
  ctx.drawImage(images.icon192, leftX + phoneW / 2 - 40, py + rowH / 2 - 60, 80, 80);
  ctx.fillStyle = "#ffffff";
  ctx.font = `600 24px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Axla", leftX + phoneW / 2, py + rowH / 2 + 50);

  if (t > 0.35) {
    const qrAlpha = Math.min(1, (t - 0.35) / 0.4);
    const qrX = startX + phoneW + colGap;
    const qrY = rowCenterY - qrBoxSize / 2;
    const qrInset = 20;
    ctx.save();
    ctx.globalAlpha = qrAlpha;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, qrX, qrY, qrBoxSize, qrBoxSize, 16);
    ctx.fill();
    ctx.drawImage(images.qr, qrX + qrInset, qrY + qrInset, qrBoxSize - qrInset * 2, qrBoxSize - qrInset * 2);
    ctx.restore();
  }

  const rightX = startX + phoneW + colGap + qrBoxSize + colGap + (1 - slide) * 140;
  drawDeviceFrame(ctx, "phone", rightX, py, androidW, rowH);
  const cardX = rightX + 30;
  const cardY = py + rowH / 2 - 55;
  ctx.fillStyle = BG;
  ctx.strokeStyle = "rgba(0,255,136,0.3)";
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, androidW - 60, 110, 14);
  ctx.fill();
  ctx.stroke();
  ctx.drawImage(images.icon192, cardX + 16, cardY + 25, 60, 60);
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 24px system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(AXLA_PROMO_COPY.installAppTitle, cardX + 92, cardY + 42);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `500 18px system-ui, sans-serif`;
  ctx.fillText(AXLA_PROMO_COPY.installTagline, cardX + 92, cardY + 70);

  const ripple = (t * 1.4) % 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - ripple) * 0.8;
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cardX + androidW - 110, cardY + 95, 14 + ripple * 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

export function AxlaShowreelStudio() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const voBuffersRef = useRef<AudioBuffer[]>([]);
  const lofiBufferRef = useRef<AudioBuffer | null>(null);
  const programGainRef = useRef<GainNode | null>(null);
  const liveMonitorGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recorderDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const activeSourcesRef = useRef<AudioScheduledSourceNode[]>([]);
  const baselineRef = useRef<number>(0);
  const rafRef = useRef<number>();
  const sceneIndexRef = useRef(0);
  const showCaptionsRefInternal = useRef(true);
  const reducedMotionRef = useRef(false);
  const imagesRef = useRef<Images | null>(null);
  const sceneBoundsRef = useRef<SceneBound[]>([]);
  const totalDurationRef = useRef(0);
  const waveDataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(128)));
  const captionCacheRef = useRef<CaptionLayout | null>(null);
  const isExportingRef = useRef(false);
  const exportTimersRef = useRef<{ stop?: ReturnType<typeof setTimeout>; progress?: ReturnType<typeof setInterval> }>({});

  const [assetsReady, setAssetsReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [exportSupported, setExportSupported] = useState(true);

  const promoActive = isPromoActive();
  const daysLeft = Math.max(0, Math.ceil((PROMO.endDate.getTime() - Date.now()) / 86_400_000));

  useEffect(() => {
    showCaptionsRefInternal.current = showCaptions;
  }, [showCaptions]);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setExportSupported(typeof window.MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function");
  }, []);

  // Decode VO files, render the synthesized bed, preload images + a real
  // scannable QR to axla.space — all before Play is enabled.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        audioCtxRef.current = ctx;

        const programGain = ctx.createGain();
        const liveMonitorGain = ctx.createGain();
        const musicGain = ctx.createGain();
        musicGain.gain.value = 0.3;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const recorderDest = ctx.createMediaStreamDestination();

        programGain.connect(analyser);
        analyser.connect(liveMonitorGain);
        liveMonitorGain.connect(ctx.destination);
        programGain.connect(recorderDest);
        musicGain.connect(programGain);

        programGainRef.current = programGain;
        liveMonitorGainRef.current = liveMonitorGain;
        musicGainRef.current = musicGain;
        analyserRef.current = analyser;
        recorderDestRef.current = recorderDest;

        const [voBuffers, lofiBuffer, icon512, icon192, qrDataUrl] = await Promise.all([
          Promise.all(
            VO_LINES.map(async (line) => {
              const res = await fetch(line.src);
              const arr = await res.arrayBuffer();
              return ctx.decodeAudioData(arr);
            }),
          ),
          buildLofiLoopBuffer(ctx),
          loadImage("/icon-512.png"),
          loadImage("/icon-192.png"),
          generateAxlaQrDataUrl(360),
        ]);
        if (cancelled) return;

        const qrImg = await loadImage(qrDataUrl);
        if (cancelled) return;

        voBuffersRef.current = voBuffers;
        lofiBufferRef.current = lofiBuffer;
        imagesRef.current = { icon512, icon192, qr: qrImg };

        const durations = voBuffers.map((b) => b.duration);
        const { bounds, total } = buildSceneBounds(durations);
        sceneBoundsRef.current = bounds;
        totalDurationRef.current = total;
        setTotalDuration(total);

        setAssetsReady(true);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load showreel assets.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopActiveSources = useCallback(() => {
    for (const node of activeSourcesRef.current) {
      try {
        node.stop();
      } catch {
        // already stopped/finished — fine to ignore
      }
    }
    activeSourcesRef.current = [];
  }, []);

  const scheduleTimeline = useCallback((startAt: number) => {
    const ctx = audioCtxRef.current;
    const programGain = programGainRef.current;
    const musicGain = musicGainRef.current;
    const lofi = lofiBufferRef.current;
    if (!ctx || !programGain || !musicGain || !lofi) return;

    const bounds = sceneBoundsRef.current;
    const total = totalDurationRef.current;

    const loop = ctx.createBufferSource();
    loop.buffer = lofi;
    loop.loop = true;
    loop.connect(musicGain);
    loop.start(startAt);
    loop.stop(startAt + total);
    activeSourcesRef.current.push(loop);

    musicGain.gain.cancelScheduledValues(startAt);
    musicGain.gain.setValueAtTime(0.3, startAt);
    for (const b of bounds) {
      musicGain.gain.linearRampToValueAtTime(0.1, startAt + b.start);
      musicGain.gain.linearRampToValueAtTime(0.3, startAt + b.end + 0.1);
    }
    musicGain.gain.linearRampToValueAtTime(0.3, startAt + total - 0.8);
    musicGain.gain.linearRampToValueAtTime(0.0001, startAt + total);

    voBuffersRef.current.forEach((buffer, i) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(programGain);
      src.start(startAt + bounds[i].start);
      activeSourcesRef.current.push(src);
      schedulePop(ctx, programGain, startAt + bounds[i].start);
    });

    baselineRef.current = startAt;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const audioCtx = audioCtxRef.current;
    const images = imagesRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !ctx || !audioCtx || !images) return;

    const w = canvas.width;
    const h = canvas.height;
    const elapsed = audioCtx.currentTime - baselineRef.current;
    const total = totalDurationRef.current;

    if (elapsed >= total && total > 0) {
      stopActiveSources();
      scheduleTimeline(audioCtx.currentTime + 0.05);
    }

    drawBackground(ctx, w, h, elapsed, reducedMotionRef.current);

    const bounds = sceneBoundsRef.current;
    let idx = 0;
    let localT = 0;
    for (let i = 0; i < bounds.length; i++) {
      if (elapsed >= bounds[i].start) {
        idx = i;
        localT = elapsed - bounds[i].start;
      }
    }
    if (idx !== sceneIndexRef.current) {
      sceneIndexRef.current = idx;
      setSceneIndex(idx);
    }

    const visual = VO_LINES[idx].visual;
    const inScene = elapsed >= bounds[idx]?.start && elapsed <= bounds[idx]?.end + GAP;
    if (inScene) {
      if (visual === "problem1") drawSceneProblem1(ctx, localT, w, h, reducedMotionRef.current);
      else if (visual === "problem2") drawSceneProblem2(ctx, localT, w, h, reducedMotionRef.current);
      else if (visual === "solution") drawSceneSolution(ctx, localT, w, h, images, bounds[idx].end - bounds[idx].start);
      else if (visual === "pricing") drawScenePricing(ctx, localT, w, h, promoActive, daysLeft, reducedMotionRef.current);
      else drawSceneCta(ctx, localT, w, h, images);
    }

    if (analyser) {
      analyser.getByteTimeDomainData(waveDataRef.current);
      drawWaveform(ctx, waveDataRef.current, w, h);
    }

    if (showCaptionsRefInternal.current) {
      const text = VO_LINES[idx].caption;
      if (captionCacheRef.current?.text !== text) {
        captionCacheRef.current = measureCaptionLines(ctx, text, w * 0.72);
      }
      drawCaption(ctx, captionCacheRef.current, w, h);
    }

    if (progressRef.current && total > 0) {
      progressRef.current.style.width = `${Math.min(100, (elapsed / total) * 100)}%`;
    }

    rafRef.current = requestAnimationFrame(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promoActive, daysLeft, scheduleTimeline, stopActiveSources]);

  const startRaf = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const handlePlay = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx || !assetsReady) return;
    if (ctx.state === "suspended") await ctx.resume();
    if (activeSourcesRef.current.length === 0) {
      scheduleTimeline(ctx.currentTime + 0.05);
    }
    setIsPlaying(true);
    startRaf();
  }, [assetsReady, scheduleTimeline, startRaf]);

  const handlePause = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    await ctx.suspend();
    setIsPlaying(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const handleReplay = useCallback(async () => {
    const ctx = audioCtxRef.current;
    if (!ctx || !assetsReady) return;
    if (ctx.state === "suspended") await ctx.resume();
    stopActiveSources();
    scheduleTimeline(ctx.currentTime + 0.05);
    setIsPlaying(true);
    startRaf();
  }, [assetsReady, scheduleTimeline, startRaf, stopActiveSources]);

  useEffect(() => {
    const gain = liveMonitorGainRef.current;
    if (gain) gain.gain.value = isMuted ? 0 : 1;
  }, [isMuted]);

  const clearExportTimers = useCallback(() => {
    if (exportTimersRef.current.progress) clearInterval(exportTimersRef.current.progress);
    if (exportTimersRef.current.stop) clearTimeout(exportTimersRef.current.stop);
    exportTimersRef.current = {};
  }, []);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      stopActiveSources();
      clearExportTimers();
      audioCtxRef.current?.close().catch(() => {});
    };
  }, [stopActiveSources, clearExportTimers]);

  const handleExport = useCallback(async () => {
    const canvas = canvasRef.current;
    const ctx = audioCtxRef.current;
    const recorderDest = recorderDestRef.current;
    // isExportingRef is a synchronous lock checked-and-set before any
    // `await` below — the `isExporting` *state* only commits on React's
    // next render, so a second click fired in that window would otherwise
    // read the old value and slip past this guard, starting a second
    // MediaRecorder against the same streams.
    if (!canvas || !ctx || !recorderDest || !exportSupported || isExportingRef.current) return;
    isExportingRef.current = true;

    await handlePause();
    stopActiveSources();

    const mimeCandidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";

    const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    const combined = new MediaStream([...canvasStream.getVideoTracks(), ...recorderDest.stream.getAudioTracks()]);

    const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "axla-25s-promo-with-vo.webm";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      isExportingRef.current = false;
      setIsExporting(false);
      setExportPct(0);
      clearExportTimers();
    };

    setIsExporting(true);
    setExportPct(0);

    // Resume + schedule BEFORE starting the recorder, so recording begins
    // right as playback does (same ~50ms pre-roll handlePlay/handleReplay
    // already use) instead of capturing a blank/silent lead-in for however
    // long ctx.resume()'s promise happens to take to settle.
    if (ctx.state === "suspended") await ctx.resume();
    const startAt = ctx.currentTime + 0.05;
    scheduleTimeline(startAt);
    recorder.start();
    setIsPlaying(true);
    startRaf();

    const total = totalDurationRef.current;
    const exportStartedAt = Date.now();
    exportTimersRef.current.progress = setInterval(() => {
      setExportPct(Math.min(100, ((Date.now() - exportStartedAt) / 1000 / total) * 100));
    }, 200);
    exportTimersRef.current.stop = setTimeout(() => {
      try {
        recorder.stop();
      } catch {
        // already stopped
      }
      handlePause();
    }, (total + 0.4) * 1000);
  }, [exportSupported, handlePause, scheduleTimeline, startRaf, stopActiveSources, clearExportTimers]);

  const sceneTitles = ["Problem", "Stress", "Meet Axla", "Launch Offer", "Install Now"];

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-2xl border border-white/10 bg-[#0B0F1A] shadow-2xl">
        <canvas ref={canvasRef} width={1920} height={1080} className="block h-auto w-full" />
        {!assetsReady && !loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F1A] text-sm font-medium text-slate-400">
            Loading VO + assets…
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0B0F1A] px-6 text-center text-sm font-medium text-red-400">
            {loadError}
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-white/10">
          <div ref={progressRef} className="h-full bg-[#00FF88]" style={{ width: "0%" }} />
        </div>
      </div>

      <div className="flex w-full max-w-[960px] flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          Scene {sceneIndex + 1}/5 — <span className="font-semibold text-white">{sceneTitles[sceneIndex]}</span>
          {totalDuration > 0 && <span className="ml-2 text-slate-500">· {totalDuration.toFixed(1)}s total</span>}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={!assetsReady || isExporting}
            className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 font-semibold text-white transition hover:border-[#00FF88]/40 hover:text-[#00FF88] disabled:opacity-40"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={handleReplay}
            disabled={!assetsReady || isExporting}
            className="rounded-lg border border-white/10 px-3 py-1.5 font-medium text-slate-300 transition hover:border-[#00FF88]/40 hover:text-[#00FF88] disabled:opacity-40"
          >
            Replay
          </button>
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            className={cn("rounded-lg border px-3 py-1.5 font-medium transition", isMuted ? "border-white/10 text-slate-500" : "border-[#00FF88]/30 text-[#00FF88]")}
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            onClick={() => setShowCaptions((c) => !c)}
            aria-pressed={showCaptions}
            className={cn("rounded-lg border px-3 py-1.5 font-medium transition", showCaptions ? "border-[#00FF88]/40 bg-[#00FF88]/10 text-[#00FF88]" : "border-white/10 text-slate-400")}
          >
            Captions
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExport}
        disabled={!assetsReady || isExporting || !exportSupported}
        className="flex w-full max-w-[960px] items-center justify-center gap-2 rounded-xl bg-[#00FF88] px-6 py-3 text-sm font-black text-[#001A29] shadow-lg shadow-[#00FF88]/20 transition hover:bg-[#1ee87f] disabled:opacity-40"
      >
        {isExporting ? `Exporting… ${exportPct.toFixed(0)}%` : "Export Video with VO"}
      </button>
      {!exportSupported && (
        <p className="max-w-[960px] text-center text-[11px] text-amber-400/80">
          This browser doesn&apos;t support canvas+audio recording (MediaRecorder/captureStream) — try Chrome or Edge to export.
        </p>
      )}
      <p className="max-w-[960px] text-center text-[11px] text-slate-500">
        VO lines are real ElevenLabs Taglish generations (public/audio/axla-vo-line*.mp3). The background bed and pop
        transitions are synthesized placeholders built from oscillators — not a licensed &ldquo;Pinoy lo-fi&rdquo; track or sampled
        SFX. Export renders exactly one pass through the timeline and saves as WebM (VP9/VP8 + Opus) — re-encode to MP4
        with ffmpeg if Meta Ads Manager needs that container.
      </p>
    </div>
  );
}
