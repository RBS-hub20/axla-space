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
 */
export async function validateImageUpload(file: File): Promise<ImageValidationResult> {
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
