"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

const FIRST_SEEN_KEY = "axla_new_features_banner_first_seen_v2";
const DISMISSED_KEY = "axla_new_features_banner_dismissed_v2";
const SHOW_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Dismissable top banner announcing the 6 new integrations — auto-expires 7 days after a user's first page load post-deploy, or sooner if manually dismissed. */
export function NewFeaturesBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return;

    let firstSeen = Number(localStorage.getItem(FIRST_SEEN_KEY));
    if (!Number.isFinite(firstSeen) || firstSeen <= 0) {
      firstSeen = Date.now();
      localStorage.setItem(FIRST_SEEN_KEY, String(firstSeen));
    }

    if (Date.now() - firstSeen > SHOW_DURATION_MS) {
      localStorage.setItem(DISMISSED_KEY, "1");
      return;
    }

    setVisible(true);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2 text-center text-xs font-medium text-[#001A29] sm:text-sm"
      style={{ background: "linear-gradient(90deg, #00FF85, #00D4FF)" }}
    >
      <span>🎉 Maya + Banks + 5 BIR Forms + Exports now LIVE — Try upload!</span>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-0.5 hover:bg-black/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
