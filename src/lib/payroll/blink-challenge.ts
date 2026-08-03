// Deliberately NOT "server-only" — picked client-side in /c/[token] so the
// staff member actually sees and can follow the instruction before the
// camera opens, then sent along with the clock POST so the server can
// store which instruction was shown for the admin's manual review.
//
// Honesty check: this is NOT real liveness detection. There is no
// automated verification that the person actually blinked/smiled/etc —
// the app has no way to analyze the photo for that. What this buys is
// (1) a mild deterrent against a pre-staged static photo, since the
// specific instruction is picked fresh and can't be known in advance, and
// (2) a concrete detail an owner can eyeball when manually reviewing a
// flagged clock-in ("did the selfie show blinking/smiling like it was
// supposed to?"). See the clock route's comment for the documented Phase 2
// plan (a real liveness API) once volume justifies it.
export const BLINK_CHALLENGE_INSTRUCTIONS = [
  "Blink twice, then tap Capture",
  "Smile, then tap Capture",
  "Look slightly left, then tap Capture",
  "Look slightly right, then tap Capture",
  "Raise your eyebrows, then tap Capture",
  "Open your mouth slightly, then tap Capture",
] as const;

export function pickBlinkChallenge(): string {
  return BLINK_CHALLENGE_INSTRUCTIONS[Math.floor(Math.random() * BLINK_CHALLENGE_INSTRUCTIONS.length)];
}
