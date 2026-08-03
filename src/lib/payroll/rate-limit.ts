import "server-only";

/**
 * In-memory per-IP limiter for the public, token-guessable payroll routes
 * (by-token lookup, payslip). Deliberately simple (no Postgres round-trip,
 * unlike src/lib/rate-limit.ts's chat limiter) since these are cheap reads
 * that need a cheap, always-available throttle in front of them.
 *
 * Caveat, honestly: this Map is per-lambda-instance. Vercel can route
 * concurrent requests to multiple warm instances (and cold starts reset the
 * Map entirely), so the *effective* ceiling under real concurrent traffic is
 * "20 requests per IP per warm instance," not a hard global 20/60s. That's
 * still a real, useful throttle against a single script hammering one
 * instance — which is the actual token-guessing threat model — but it is
 * not a substitute for a shared store (e.g. the existing chat_rate_limits
 * Postgres table/RPC pattern) if this ever needs a hard global guarantee.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

interface Bucket {
  count: number;
  resetTime: number;
}

const buckets = new Map<string, Bucket>();

// Bounds the Map's growth under sustained traffic from many distinct IPs —
// without this, a slow trickle of unique IPs would leak memory for the
// life of the lambda instance since expired buckets are only cleaned up
// lazily, on the next request from that same IP.
const MAX_TRACKED_IPS = 5000;

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkPayrollTokenRateLimit(ip: string, routeLabel: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(ip);

  if (!existing || now >= existing.resetTime) {
    if (buckets.size >= MAX_TRACKED_IPS) {
      buckets.clear();
    }
    buckets.set(ip, { count: 1, resetTime: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((existing.resetTime - now) / 1000);
    console.warn(
      `payroll rate limit: ${ip} exceeded ${MAX_REQUESTS}/60s on ${routeLabel} (count=${existing.count}, retryAfter=${retryAfterSeconds}s)`,
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
