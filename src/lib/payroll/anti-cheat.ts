// Deliberately NOT "server-only" — the flag-reason formatting is plain
// string/math logic with no secrets, useful to unit test directly (and
// potentially preview client-side later) without pulling in server guards.
import { haversineMeters } from "@/lib/payroll/geo";

export const IMPOSSIBLE_SPEED_KMH = 200;
export const IMPOSSIBLE_DISTANCE_KM = 50;
export const IMPOSSIBLE_DISTANCE_WINDOW_HOURS = 0.5;

export interface PriorLog {
  lat: number | null;
  lng: number | null;
  createdAt: string;
  type: "in" | "out";
}

export interface TravelCheckResult {
  flagged: boolean;
  distanceKm: number | null;
  speedKmh: number | null;
  note: string | null;
}

/**
 * Compares this clock event's coordinates against the staff member's own
 * previous event (regardless of type) — not the shop's geofence, which is
 * checked separately. Two independent trigger conditions, either one
 * flags: (1) implied speed is faster than any real travel in Metro Manila
 * (200 km/h — well above traffic, motorcycle, or even most flights' door-
 * to-door average), or (2) a large jump (>50km) inside a short window
 * (<30min) even if the raw speed math is ambiguous at very short elapsed
 * times. Always a soft flag (needs_approval), never a hard reject — same
 * reasoning as the geofence/daily-code checks this sits alongside: a
 * genuine GPS hiccup must never lock a real employee out of clocking in.
 */
export function checkImpossibleTravel(prior: PriorLog | null, lat: number, lng: number, now: Date): TravelCheckResult {
  if (!prior || prior.lat === null || prior.lng === null) {
    return { flagged: false, distanceKm: null, speedKmh: null, note: null };
  }

  const distanceKm = haversineMeters(prior.lat, prior.lng, lat, lng) / 1000;
  const hoursElapsed = Math.max((now.getTime() - new Date(prior.createdAt).getTime()) / 3_600_000, 0);

  // Sub-second gap with real distance is instantly implausible regardless
  // of the speed formula's behavior at hoursElapsed ~ 0 — treat as infinite
  // speed rather than dividing by a near-zero number.
  const speedKmh = hoursElapsed < 1 / 3600 ? (distanceKm > 0 ? Infinity : 0) : distanceKm / hoursElapsed;

  const flagged = speedKmh > IMPOSSIBLE_SPEED_KMH || (distanceKm > IMPOSSIBLE_DISTANCE_KM && hoursElapsed < IMPOSSIBLE_DISTANCE_WINDOW_HOURS);

  if (!flagged) {
    return { flagged: false, distanceKm, speedKmh, note: null };
  }

  const minutesAgo = Math.round(hoursElapsed * 60);
  const speedLabel = Number.isFinite(speedKmh) ? `${Math.round(speedKmh).toLocaleString()} km/h` : "instant";
  const note = `${prior.type.toUpperCase()} ${minutesAgo}min ago, ${distanceKm.toFixed(1)}km away from this ${minutesAgo === 0 ? "same-moment" : ""} event (${speedLabel}) — not physically possible, review before approving.`;

  return { flagged: true, distanceKm, speedKmh, note };
}

export interface MockLocationInput {
  accuracy: number | null;
  altitude: number | null;
  isMocked: boolean;
}

export interface MockLocationResult {
  flagged: boolean;
  note: string | null;
}

const IMPLAUSIBLE_ACCURACY_METERS_MAX = 1000;
const SUSPICIOUSLY_PRECISE_ACCURACY_METERS = 5;

/**
 * The web Geolocation API (navigator.geolocation, used by /c/[token])
 * cannot itself tell you a position was mocked — `isMocked` only ever
 * arrives non-false if a future native wrapper (this app already ships
 * Capacitor deps) supplies it via a platform API Android/iOS expose to
 * native code, not to browsers. Until that exists, this function still
 * earns its keep from the other two signals: `accuracy` and `altitude`
 * ARE real fields the browser's Coordinates object provides today.
 * - accuracy > 1000m: GPS essentially failed / fell back to coarse
 *   IP-based positioning, or a manufactured fix reporting a fake radius.
 * - accuracy < 5m AND altitude === 0: implausibly precise for a phone GPS
 *   fix (real phone GPS rarely reports single-digit-meter accuracy) paired
 *   with the classic "0" a naive location-spoofing tool defaults altitude
 *   to instead of the device's real elevation.
 */
export function checkMockLocation({ accuracy, altitude, isMocked }: MockLocationInput): MockLocationResult {
  if (isMocked) {
    return { flagged: true, note: "Device reported this location as mocked." };
  }
  if (accuracy !== null && accuracy > IMPLAUSIBLE_ACCURACY_METERS_MAX) {
    return { flagged: true, note: `GPS accuracy was ${Math.round(accuracy)}m — too imprecise to trust.` };
  }
  if (accuracy !== null && accuracy < SUSPICIOUSLY_PRECISE_ACCURACY_METERS && altitude === 0) {
    return { flagged: true, note: `Suspiciously precise accuracy (${accuracy}m) with altitude exactly 0 — common in spoofed GPS fixes.` };
  }
  return { flagged: false, note: null };
}

export interface IpGeoResult {
  flagged: boolean;
  distanceKm: number | null;
  note: string | null;
}

const IP_GPS_MISMATCH_KM = 100;

/**
 * Optional, best-effort — Vercel populates x-vercel-ip-latitude/longitude
 * on requests that actually pass through its edge network (production
 * only; absent in local dev, and only as precise as IP geolocation ever
 * is — a legitimate staff member on mobile data can easily show a
 * carrier's regional gateway location 50-100km from their real spot, so
 * the threshold here is deliberately generous and this is always a soft
 * flag, never a rejection).
 */
export function checkIpGeoMismatch(req: Request, lat: number, lng: number): IpGeoResult {
  const latHeader = req.headers.get("x-vercel-ip-latitude");
  const lngHeader = req.headers.get("x-vercel-ip-longitude");
  if (!latHeader || !lngHeader) {
    return { flagged: false, distanceKm: null, note: null };
  }
  const ipLat = Number(latHeader);
  const ipLng = Number(lngHeader);
  if (!Number.isFinite(ipLat) || !Number.isFinite(ipLng)) {
    return { flagged: false, distanceKm: null, note: null };
  }
  const distanceKm = haversineMeters(ipLat, ipLng, lat, lng) / 1000;
  if (distanceKm > IP_GPS_MISMATCH_KM) {
    return { flagged: true, distanceKm, note: `IP location is ~${Math.round(distanceKm)}km from the reported GPS position.` };
  }
  return { flagged: false, distanceKm, note: null };
}
