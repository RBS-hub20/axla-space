"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pwa-dismissed";
const SHOW_DELAY_MS = 8000;

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (!deferredPrompt) return;
    if (!isMobileDevice() || isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [deferredPrompt]);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4 sm:hidden">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-[#00FF88]/20 bg-[#0B0F1A]/95 p-4 shadow-2xl backdrop-blur-lg">
        <Image
          src="/icon-192.png"
          alt="Axla"
          width={48}
          height={48}
          className="h-12 w-12 shrink-0 rounded-xl"
        />
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">Install Axla App</p>
          <p className="text-xs text-slate-400">Parang GCash for BIR filing</p>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          <button
            onClick={install}
            className="rounded-lg bg-[#00FF88] px-3 py-1.5 text-xs font-semibold text-[#0B0F1A] transition hover:brightness-110"
          >
            Install
          </button>
          <button
            onClick={dismiss}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:text-slate-200"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
