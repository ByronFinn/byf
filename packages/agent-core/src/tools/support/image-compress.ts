/**
 * image-compress — 缩小 + 重编码大图,使其适配模型的 token / 上下文预算。
 *
 * ReadMediaFileTool 以 base64 data URL 发送图片。全分辨率截图很容易撑爆
 * 上下文预算,因此在 base64 编码前运行本管线:限制最长边,然后沿 JPEG
 * 质量阶梯下降,直到结果落入字节预算。
 *
 * 范围(见 ADR / issue #233):Jimp 默认插件可解码 PNG/JPEG/GIF/BMP/TIFF,
 * 但**不**支持 WebP,且重编码 GIF 会丢失动画。因此 WebP 与 GIF 原样透传
 * (它们本就小 / 高效)。BMP 在压缩运行前就被格式闸门拒绝(不在
 * MODEL_ACCEPTED_IMAGE_MIMES 中),因此刻意不在可压缩集合内。实际压缩目标
 * 是 PNG 与 JPEG。这是 BYF 适当的子集——无面积平均缩放,无完整格式策略
 * 机制。
 */

import { Jimp } from 'jimp';

import { sniffImageDimensions } from './file-type';

/** The concrete image type returned by `Jimp.read` (avoids naming the generic JimpInstance, which TS can resolve as a duplicate). */
type DecodedImage = Awaited<ReturnType<typeof Jimp.read>>;

// ── Tunables ─────────────────────────────────────────────────────────

/** 解码后图像允许保留的最长边,单位像素。 */
export const MAX_IMAGE_EDGE_PX = 2000;
/** 软字节预算;已低于此值(且在边限内)的图像直接透传。 */
export const IMAGE_BYTE_BUDGET = Math.floor(3.75 * 1024 * 1024);
/** 防解压炸弹:像素数超过此值则拒绝解码。 */
export const MAX_DECODE_PIXELS = 100_000_000;
/** 防解压炸弹:字节数超过此值则拒绝尝试解码。 */
export const MAX_DECODE_BYTES = 64 * 1024 * 1024;

/**
 * ReadMediaFile 入口的字节预算——原始文件大小超过此值,在任何解码 / 压缩
 * 尝试前即拒绝读取。保持小于 {@link IMAGE_BYTE_BUDGET}(压缩后目标),
 * 使单个超大文件不会消耗内存。
 */
export const READ_IMAGE_BYTE_BUDGET = 100 * 1024 * 1024;

/**
 * 从环境变量解析正整数。变量缺失、为空或不是正整数时返回 `undefined`——
 * 调用方回退到配置或内置默认值。
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
 * 从 `BYF_IMAGE_MAX_EDGE_PX` 读取最大图像边限覆盖。
 * 操作员级(进程范围);按 owner 的配置叠加在其下。
 */
export function maxImageEdgeFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): number | undefined {
  return positiveIntFromEnv(env, 'BYF_IMAGE_MAX_EDGE_PX');
}

/**
 * 从 `BYF_IMAGE_READ_BYTE_BUDGET` 读取读入口字节预算覆盖。
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
  /** detectFileType 嗅探 / 接受的 MIME。 */
  readonly mimeType: string;
  /** 默认 {@link MAX_IMAGE_EDGE_PX}。 */
  readonly maxEdgePx?: number;
  /** 默认 {@link IMAGE_BYTE_BUDGET};已低于此值的图像快速透传。 */
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
 * 为模型消费压缩图像。
 *
 * - WebP / GIF / 不支持的 MIME → 透传(返回原始数据)。
 * - 已在边限 + 字节预算内 → 透传。
 * - 否则:解码(带防炸弹守卫),缩小到 `maxEdgePx`,沿 JPEG 质量阶梯重编码。
 *
 * 绝不抛出:任何解码 / 编码错误都返回携带原始数据的 `error` 结果,
 * 使调用方可回退为发送原图。
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
