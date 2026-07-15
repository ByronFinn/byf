/**
 * image-originals — content-addressed cache of original (pre-compression)
 * images so the model can re-read full detail when a ReadMediaFile result
 * was compressed.
 *
 * Storage layout: `<sessionDir | os.tmpdir()>/media-originals/<sha32>.<ext>`.
 * Content addressing makes the cache idempotent — re-reading the same image
 * bytes always lands at the same path, so a duplicate write is a no-op.
 *
 * This module is deliberately best-effort: any FS error returns `null`
 * instead of throwing, so a cache miss never blocks the prompt. The session
 * dir is cleaned with the session; os.tmpdir() is cleaned by the OS.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface OriginalImageRecord {
  /** Absolute path where the original was saved. */
  readonly path: string;
  readonly mimeType: string;
  readonly byteSize: number;
}

/** Map an image MIME type to a file extension. Unknown → `bin`. */
function extForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/bmp':
      return 'bmp';
    default:
      return 'bin';
  }
}

/**
 * Persist an original image to the content-addressed cache.
 *
 * - Filename: `<first-32-hex-of-sha256>.<ext>` (content addressing ⇒ idempotent).
 * - If the target already exists with the same byte size, the write is
 *   skipped (a re-read of the same bytes is a no-op).
 * - Any FS error → returns `null` (never throws, never blocks the prompt).
 *
 * Sweep / eviction is intentionally out of scope for this PR; the session
 * dir is cleaned with the session and os.tmpdir() is cleaned by the OS.
 * TODO: add opportunistic eviction if the cache grows large.
 */
export async function persistOriginalImage(input: {
  readonly data: Buffer;
  readonly mimeType: string;
  /** When available; falls back to os tmpdir(). */
  readonly sessionDir?: string;
}): Promise<OriginalImageRecord | null> {
  const { data, mimeType } = input;
  try {
    const hash = createHash('sha256').update(data).digest('hex').slice(0, 32);
    const dir = join(input.sessionDir ?? tmpdir(), 'media-originals');
    const ext = extForMime(mimeType);
    const path = join(dir, `${hash}.${ext}`);

    // Idempotent: skip if a file with the same size already exists.
    if (existsSync(path)) {
      try {
        const existing = statSync(path);
        if (existing.size === data.length) {
          return { path, mimeType, byteSize: data.length };
        }
      } catch {
        // Stat failed (race / permissions) — fall through and overwrite.
      }
    }

    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      // Recreating a parent dir that is a file, or a permission error.
      // Try writing directly; if the dir is truly unusable the write below
      // also throws and we return null.
    }
    writeFileSync(path, data);
    return { path, mimeType, byteSize: data.length };
  } catch {
    return null;
  }
}
