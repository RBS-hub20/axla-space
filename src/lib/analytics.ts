import posthog from "posthog-js";

/**
 * Fires a PostHog event. No-ops safely if PostHog isn't configured
 * (NEXT_PUBLIC_POSTHOG_KEY unset) or if called outside the browser.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

  posthog.capture(name, properties);
}
