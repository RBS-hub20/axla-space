import withPWAInit from "@ducanh2912/next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfjs-dist resolves its worker script relative to its own package files
  // at runtime — webpack bundling that into a single serverless chunk
  // breaks that resolution ("Cannot find module .../pdf.worker.mjs").
  // Marking it external keeps it as a plain node_modules require so Node
  // resolves the real file directly.
  experimental: {
    serverComponentsExternalPackages: ["pdfjs-dist"],
    // serverComponentsExternalPackages keeps pdfjs-dist un-bundled, but
    // Vercel's file tracer still doesn't detect pdf.worker.mjs — pdfjs
    // resolves it via an import.meta.url-relative dynamic import the
    // tracer's static analysis can't follow — so it gets silently pruned
    // from the deployed function ("Cannot find module .../pdf.worker.mjs").
    // Force-including the whole legacy build directory fixes that.
    outputFileTracingIncludes: {
      "/api/gcash/parse": ["./node_modules/pdfjs-dist/legacy/build/**"],
      "/api/dashboard/transactions": ["./node_modules/pdfjs-dist/legacy/build/**"],
    },
  },
};

/**
 * @ducanh2912/next-pwa, not the literal "next-pwa" package — that original
 * package is effectively unmaintained for App Router-era Next.js (its file-
 * tracing assumptions predate app/) and would risk exactly the kind of
 * silent build breakage this config already has one hard-won workaround for
 * (see outputFileTracingIncludes above). This fork explicitly targets
 * Next >=14 and is what the Next.js/PWA community has moved to instead.
 *
 * runtimeCaching deliberately does NOT add a blanket StaleWhileRevalidate
 * over the whole axla.space domain — that would cache authenticated
 * /dashboard and /admin responses and could serve one user's cached data to
 * the next person on a shared device. This library's own default runtime
 * caching (kept via extendDefaultRuntimeCaching) already handles /api/*
 * with NetworkFirst + a 10s timeout, GET-only, so mutations and slow
 * network never see stale reads — only Supabase's own asset host is added
 * on top of that default set.
 */
const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    skipWaiting: true,
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-cache",
        expiration: { maxEntries: 32, maxAgeSeconds: 60 * 5 },
        networkTimeoutSeconds: 10,
      },
    },
  ],
  fallbacks: {
    document: "/~offline",
  },
});

export default withPWA(nextConfig);
