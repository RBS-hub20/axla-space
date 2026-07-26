"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Fires one anonymous page-view beacon per pathname per browser session
 * (sessionStorage-gated, so a refresh or in-page navigation back to the
 * same route doesn't double-count). Never tracks /admin or /dashboard —
 * the user only wants public landing-page traffic, not their own admin
 * usage or logged-in customer activity.
 */
export function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) return;

    const sessionKey = `viewed_${pathname}`;
    if (sessionStorage.getItem(sessionKey)) return;

    const utm_source = searchParams.get("utm_source") || undefined;
    const utm_medium = searchParams.get("utm_medium") || undefined;
    const utm_campaign = searchParams.get("utm_campaign") || undefined;
    const referrer = document.referrer || undefined;
    const device = /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop";

    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pathname, referrer, utm_source, utm_medium, utm_campaign, device }),
    }).catch(() => {});

    sessionStorage.setItem(sessionKey, "1");
  }, [pathname, searchParams]);

  return null;
}
