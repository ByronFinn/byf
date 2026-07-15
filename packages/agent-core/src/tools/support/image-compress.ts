/**
 * image-compress — downscale + re-encode large images so they fit the
 * model's token / context budget.
 *
 * ReadMediaFileTool sends images as base64 data URLs. A full-resolution
 * screenshot easily blows the context budget, so before base64-encoding we
 * run this pipeline: cap the longest edge, then walk a JPEG quality ladder
 * until the result fits a byte budget.
 *
 * Scope (see ADR / issue #233): Jimp's default plugins decode PNG/JPEG/GIF/
 * BMP/TIFF but NOT WebP, and re-encoding GIF drops animation. WebP and GIF
 * therefore pass through unchanged (they are already small / efficient).
 * BMP is rejected by the format gate (not in MODEL_ACCEPTED_IMAGE_MIMES)
 * before compression runs, so it is intentionally not in the compressible
 * set. Effective compression targets PNG and JPEG. This is the BYF-
 * appropriate subset — no area-average resizing, no full-format-policy
 * machinery.
 */

import { Jimp } from 'jimp';

import { sniffImageDimensions } from './file-type';

/** The concrete image type returned by `Jimp.read` (avoids naming the generic JimpInstance, which TS can resolve as a duplicate). */
type DecodedImage = Awaited<ReturnType<typeof Jimp.read>>;

// ── Tunables ─────────────────────────────────────────────────────────

/** Longest edge a decoded image is allowed to keep, in pixels. */
export const MAX_IMAGE_EDGE_PX = 2000;
/** Soft byte budget; images already under this (and within the edge) pass through. */
export const IMAGE_BYTE_BUDGET = Math.floor(3.75 * 1024 * 1024);
/** Guard against decompression bombs: refuse to decode above this many pixels. */
export const MAX_DECODE_PIXELS = 100_000_000;
/** Guard against decompression bombs: refuse to even attempt decode above this many bytes. */
export const MAX_DECODE_BYTES = 64 * 1024 * 1024;

/**
 * Byte budget for the ReadMediaFile entry point — the raw file size above
 * which reading is refused before any decode/compress attempt. Kept smaller
 * than {@link IMAGE_BYTE_BUDGET} (the post-compress target) so a single
 * huge file does not consume memory.
 */
export const READ_IMAGE_BYTE_BUDGET = 100 * 1024 * 1024;

/**
 * Parse a positive integer from an environment variable. Returns `undefined`
 * when the variable is absent, empty, or not a positive integer — the caller
 * falls back to config or built-in defaults.
 */
export function positiveIntFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
): number | undefined {
  const raw = env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Read the max image edge override from `BYF_IMAGE_MAX_EDGE_PX`.
 * Operator-level (process-wide); per-owner config is layered underneath.
 */
export function maxImageEdgeFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): number | undefined {
  return positiveIntFromEnv(env, 'BYF_IMAGE_MAX_EDGE_PX');
}

/**
 * Read the read-entry byte budget override from `BYF_IMAGE_READ_BYTE_BUDGET`.
 */
export function readImageByteBudgetFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): number | undefined {
  return positiveIntFromEnv(env, 'BYF_IMAGE_READ_BYTE_BUDGET');
}

/** JPEG quality ladder — walked high to low, first fit under budget wins. */
const JPEG_QUALITY_LADDER: readonly number[] = [80, 60, 40, 20];

// ── Types ────────────────────────────────────────────────────────────

export interface CompressInput {
  readonly data: Buffer;
  /** The sniffed/accepted MIME from detectFileType. */
  readonly mimeType: string;
  /** Default {@link MAX_IMAGE_EDGE_PX}. */
  readonly maxEdgePx?: number;
  /** Default {@link IMAGE_BYTE_BUDGET}; images already under this pass through fast. */
  readonly byteBudget?: number;
}

export type CompressOutcome =
  | { readonly kind: 'passthrough' }
  | {
      readonly kind: 'compressed';
      readonly data: Buffer;
      readonly mimeType: string;
      readonly originalBytes: number;
      readonly finalBytes: number;
    }
  | { readonly kind: 'error'; readonly message: string };

export interface CompressResult {
  readonly data: Buffer;
  readonly mimeType: string;
  readonly outcome: CompressOutcome;
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Formats Jimp can decode + re-encode. WebP/GIF/BMP are passed through or gated out. */
function isCompressible(mimeType: string): boolean {
  return mimeType === 'image/png' || mimeType === 'image/jpeg';
}

/** True when the longest edge is already within the cap. */
function withinEdge(data: Buffer, maxEdgePx: number): boolean {
  const dims = sniffImageDimensions(data);
  if (dims === null) {
    // Can't read dimensions — only the byte budget can gate passthrough.
    return true;
  }
  return Math.max(dims.width, dims.height) <= maxEdgePx;
}

/**
 * Re-encode a decoded Jimp image, walking the JPEG quality ladder as needed.
 *
 * For PNG source: try PNG first (lossless); if still over budget, fall back
 * to JPEG quality ladder. For JPEG source: walk the JPEG ladder directly
 * (already lossy). Returns the smallest acceptable buffer; if nothing fits
 * the budget, returns the lowest-quality attempt (still better than the
 * original).
 */
async function reencode(
  image: DecodedImage,
  sourceMime: string,
  byteBudget: number,
): Promise<{ readonly data: Buffer; readonly mimeType: string }> {
  const tryPngFirst = sourceMime === 'image/png';
  const candidates: { readonly data: Buffer; readonly mimeType: string }[] = [];

  if (tryPngFirst) {
    try {
      const png = await image.getBuffer('image/png');
      candidates.push({ data: Buffer.from(png), mimeType: 'image/png' });
    } catch {
      // PNG re-encode failed — fall through to JPEG ladder.
    }
  }

  for (const quality of JPEG_QUALITY_LADDER) {
    try {
      const jpeg = await image.getBuffer('image/jpeg', { quality });
      candidates.push({ data: Buffer.from(jpeg), mimeType: 'image/jpeg' });
    } catch {
      break;
    }
  }

  if (candidates.length === 0) {
    throw new Error('all re-encode attempts failed');
  }

  // Prefer the first candidate under budget; otherwise the smallest overall.
  const underBudget = candidates.find((c) => c.data.length <= byteBudget);
  if (underBudget !== undefined) return underBudget;

  let best = candidates[0]!;
  for (const c of candidates) {
    if (c.data.length < best.data.length) best = c;
  }
  return best;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Compress an image for model consumption.
 *
 * - WebP / GIF / unsupported MIME → passthrough (returns the original data).
 * - Already within edge + byte budget → passthrough.
 * - Otherwise: decode (with bomb guards), downscale to `maxEdgePx`, re-encode
 *   walking a JPEG quality ladder.
 *
 * Never throws: on any decode/encode error returns outcome `error` with the
 * original data, so the caller can fall back to sending the original.
 */
export async function compressImageForModel(input: CompressInput): Promise<CompressResult> {
  const { data, mimeType } = input;
  const maxEdgePx = input.maxEdgePx ?? MAX_IMAGE_EDGE_PX;
  const byteBudget = input.byteBudget ?? IMAGE_BYTE_BUDGET;

  // WebP (Jimp can't re-encode) and GIF (re-encoding drops animation) pass
  // through unchanged. Non-image / unsupported MIME also passes through —
  // the caller already gated the format.
  if (!isCompressible(mimeType)) {
    return { data, mimeType, outcome: { kind: 'passthrough' } };
  }

  // Fast path: already within budget and edge. Avoids the decode cost.
  if (data.length <= byteBudget && withinEdge(data, maxEdgePx)) {
    return { data, mimeType, outcome: { kind: 'passthrough' } };
  }

  // Bomb guard: refuse to even attempt decode on huge inputs.
  if (data.length > MAX_DECODE_BYTES) {
    return {
      data,
      mimeType,
      outcome: {
        kind: 'error',
        message: `input ${String(data.length)} bytes exceeds decode limit`,
      },
    };
  }

  // Pre-decode pixel guard: for formats whose dimensions we can read from the
  // header (PNG/JPEG/GIF/BMP), reject a sparse huge image *before* Jimp.read
  // allocates the full bitmap in memory. A compressed-but-gigantic PNG would
  // otherwise pass the byte guard above and blow the heap on decode. Formats
  // we can't size from the header fall through to the post-decode guard.
  const preDims = sniffImageDimensions(data);
  if (preDims !== null) {
    const prePixels = preDims.width * preDims.height;
    if (prePixels > MAX_DECODE_PIXELS) {
      return {
        data,
        mimeType,
        outcome: {
          kind: 'error',
          message: `declared ${String(preDims.width)}x${String(preDims.height)} (${String(prePixels)} pixels) exceeds pixel limit`,
        },
      };
    }
  }

  let image: DecodedImage;
  try {
    image = await Jimp.read(data);
  } catch (error) {
    return {
      data,
      mimeType,
      outcome: {
        kind: 'error',
        message: `decode failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  // Bomb guard: pixel-count cap on the decoded bitmap.
  const pixels = image.bitmap.width * image.bitmap.height;
  if (pixels > MAX_DECODE_PIXELS) {
    return {
      data,
      mimeType,
      outcome: {
        kind: 'error',
        message: `decoded ${String(pixels)} pixels exceeds pixel limit`,
      },
    };
  }

  // Downscale so the longest edge fits (never upscale).
  const longestEdge = Math.max(image.bitmap.width, image.bitmap.height);
  if (longestEdge > maxEdgePx) {
    try {
      if (image.bitmap.width >= image.bitmap.height) {
        image.resize({ w: maxEdgePx });
      } else {
        image.resize({ h: maxEdgePx });
      }
    } catch (error) {
      return {
        data,
        mimeType,
        outcome: {
          kind: 'error',
          message: `resize failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      };
    }
  }

  try {
    const result = await reencode(image, mimeType, byteBudget);
    return {
      data: result.data,
      mimeType: result.mimeType,
      outcome: {
        kind: 'compressed',
        data: result.data,
        mimeType: result.mimeType,
        originalBytes: data.length,
        finalBytes: result.data.length,
      },
    };
  } catch (error) {
    return {
      data,
      mimeType,
      outcome: {
        kind: 'error',
        message: `re-encode failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}
