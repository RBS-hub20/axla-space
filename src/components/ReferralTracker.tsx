"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

// Renders nothing — just fires a one-time, fire-and-forget log of ?ref
// clicks on the landing page for the admin "Referral Link" feature.
export function ReferralTracker() {
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref");

  useEffect(() => {
    if (!ref) return;
    fetch("/api/referral/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    }).catch(() => {});
  }, [ref]);

  return null;
}
