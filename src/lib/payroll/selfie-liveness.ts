import "server-only";
import { fileTypeFromBuffer } from "file-type";
import imageSize from "image-size";

/**
 * Hotfix (post security-audit finding #5): the original version of this
 * check also rejected images with no EXIF data, or whose dimensions
 * matched a common phone screen resolution, as "looks like a screenshot."
 * That heuristic was too aggressive in production — real iPhone Safari
 * front-camera selfies got rejected (iOS strips EXIF on some capture
 * paths), blocking real employees from clocking in. Removed entirely
 * rather than tuned, since there's no reliable EXIF-presence signal to
 * tune it against — real liveness verification is still the documented
 * Phase 2 plan (AWS Rekognition/Smile ID-class API) once volume justifies
 * it; this file now only does cheap, low-false-positive sanity checks:
 * a real image via magic bytes, a size range, and a minimum resolution.
 */
export const MIN_SELFIE_BYTES = 10 * 1024; // 10KB — rejects near-blank/placeholder images
export const MAX_SELFIE_BYTES = 10 * 1024 * 1024; // 10MB
const MIN_SELFIE_DIMENSION = 200; // px, both width and height

const ALLOWED_SELFIE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

export interface LivenessCheckResult {
  ok: boolean;
  error?: string;
}

/**
 * Self-contained selfie check — magic-byte type check (security audit
 * finding #4: rejects a mislabeled .exe/.js/etc regardless of claimed
 * Content-Type) plus a size range and minimum resolution. HEIC/HEIF is
 * allowed since iPhone camera captures sometimes produce it directly.
 * Deliberately NOT applied to receipt uploads (those go through the
 * separate, unmodified validateImageUpload — a GCash screenshot is
 * supposed to be a screenshot).
 */
export async function checkSelfieLiveness(file: File): Promise<LivenessCheckResult> {
  if (file.size < MIN_SELFIE_BYTES) {
    return { ok: false, error: "Photo too small — move closer and try again." };
  }
  if (file.size > MAX_SELFIE_BYTES) {
    return { ok: false, error: "Photo too large — try again." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);

  if (!detected || !ALLOWED_SELFIE_TYPES.includes(detected.mime)) {
    return { ok: false, error: "That doesn't look like a valid photo — please try again." };
  }

  try {
    const dims = imageSize(Buffer.from(bytes));
    if (dims.width && dims.height && (dims.width < MIN_SELFIE_DIMENSION || dims.height < MIN_SELFIE_DIMENSION)) {
      return { ok: false, error: "Photo resolution is too low — please retake." };
    }
  } catch {
    // Unreadable dimensions (can happen for HEIC depending on encoder) —
    // don't block on this alone, the magic-byte + size checks already ran.
  }

  return { ok: true };
}
