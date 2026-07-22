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

export default nextConfig;
