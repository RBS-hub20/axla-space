import "server-only";
import { fileTypeFromBuffer } from "file-type";
import imageSize from "image-size";
import exifr from "exifr";

/**
 * Security audit finding #5, "low-cost fix without API": these are
 * heuristics, not real liveness detection. A determined attacker can still
 * defeat every check here (strip/fake EXIF, print a photo at the right
 * resolution, etc.) — this exists to raise the bar for casual buddy-
 * punching and to catch the laziest cases (submitting a saved screenshot
 * outright), not to replace a real liveness API. See the code comment in
 * the clock route for the documented Phase 2 plan (AWS Rekognition / Smile
 * ID) once volume justifies the per-check cost.
 */
export const MIN_SELFIE_BYTES = 20 * 1024; // 20KB — rejects near-blank/placeholder images

// Common phone screen resolutions (both orientations) — a real front-camera
// selfie almost never matches these exactly (camera sensors use their own,
// much higher/different resolutions), while a screenshot of a photo/video
// call frequently does.
const SCREEN_RESOLUTIONS: Array<[number, number]> = [
  [1170, 2532], [2532, 1170], // iPhone 12/13/14
  [1179, 2556], [2556, 1179], // iPhone 15/16
  [1080, 2400], [2400, 1080], // common Android FHD+
  [1080, 1920], [1920, 1080], // common Android FHD
  [828, 1792], [1792, 828],   // iPhone 11/XR
  [1242, 2688], [2688, 1242], // iPhone 11 Pro Max/XS Max
  [750, 1334], [1334, 750],   // iPhone SE/6/7/8
  [1125, 2436], [2436, 1125], // iPhone X/XS/11 Pro
  [1284, 2778], [2778, 1284], // iPhone 12/13 Pro Max
];

export interface LivenessCheckResult {
  ok: boolean;
  error?: string;
}

/**
 * Runs after the existing validateImageUpload() (real MIME check, 5MB
 * max) — this adds the selfie-specific liveness heuristics on top: a
 * minimum size floor, and a screenshot detector combining format/EXIF/
 * dimensions. Deliberately NOT applied to receipt uploads (a GCash
 * screenshot is expected to be an actual screenshot — penalizing that
 * would break the receipt flow for no security benefit).
 */
export async function checkSelfieLiveness(file: File): Promise<LivenessCheckResult> {
  if (file.size < MIN_SELFIE_BYTES) {
    return { ok: false, error: "That image is too small to be a real photo — please retake your selfie." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);

  let noExif = true;
  if (detected?.mime === "image/jpeg") {
    try {
      const exif = await exifr.parse(Buffer.from(bytes), { pick: ["Make", "Model", "DateTimeOriginal"] });
      noExif = !exif || Object.keys(exif).length === 0;
    } catch {
      noExif = true;
    }
  } else {
    // PNG/WebP rarely carry EXIF even from a real camera — don't penalize
    // format alone, only the dimension check below applies to these.
    noExif = false;
  }

  let isScreenResolution = false;
  try {
    const dims = imageSize(Buffer.from(bytes));
    if (dims.width && dims.height) {
      isScreenResolution = SCREEN_RESOLUTIONS.some(([w, h]) => dims.width === w && dims.height === h);
    }
  } catch {
    // Unreadable dimensions — fall through without flagging on this signal alone.
  }

  const looksLikeScreenshot = (detected?.mime === "image/jpeg" && noExif) || isScreenResolution;
  if (looksLikeScreenshot) {
    return { ok: false, error: "That looks like a screenshot or saved image — please take a new selfie with your camera." };
  }

  return { ok: true };
}
