import "server-only";
import { fileTypeFromBuffer } from "file-type";

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

export interface ImageValidationResult {
  ok: boolean;
  error?: string;
}

/**
 * Security audit finding #4: the old check only looked at `File.type`,
 * which is a client-supplied label (the multipart Content-Type header) —
 * trivial to spoof by setting `type=image/jpeg` on any file when the
 * request isn't built through a real browser file picker. This sniffs the
 * actual file header/magic bytes instead, so a mislabeled .exe/.js/etc.
 * gets rejected regardless of what Content-Type it claims.
 *
 * `minBytes` defaults to 0 (no floor) — receipts legitimately vary in size.
 * Selfie call sites pass MIN_SELFIE_BYTES (see selfie-liveness.ts, finding
 * #5) since a real camera photo is essentially never a few-KB placeholder.
 */
export async function validateImageUpload(file: File, minBytes = 0): Promise<ImageValidationResult> {
  if (file.size < minBytes) {
    return { ok: false, error: "That image is too small to be a real photo." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: "Image must be under 5MB." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);

  if (!detected || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected.mime)) {
    return { ok: false, error: "File must be a real JPEG, PNG, or WebP image." };
  }

  return { ok: true };
}
