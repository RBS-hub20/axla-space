// Deliberately NOT "server-only" — pure math, and the client-side map
// picker (Settings tab) needs the same distance calc for its live preview
// as the server uses for the authoritative check.

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000; // Earth radius, meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** 4-digit code written on the shop whiteboard — a second "actually on-site" signal GPS alone can't provide, since it can't be read remotely. */
export function generateDailyCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
