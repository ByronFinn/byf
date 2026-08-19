/**
 * prompt 图片附件(data-URL)→ `image_url` PromptPart。
 *
 * 与 TUI 粘贴(`byf-tui.handleClipboardImagePaste`)共用同一条压缩管道
 * (`compressImageForModel` + `ImageLimits`,env > config > default),使两端
 * 进入 provider 的字节预算一致;浏览器端不做压缩,避免预算逻辑分叉。
 */

import type { ByfConfig, PromptPart } from '@byfriends/sdk';
import { compressImageForModel, ImageLimits } from '@byfriends/sdk';
import type { PromptImageBody } from '@byfriends/web-shared';

// data:image/png;base64,<payload> — MIME 必须是 image/*,载荷必须是 base64。
// base64 段用严格字符集校验,防 `Buffer.from` 静默吞掉非法字符。
const DATA_IMAGE_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/** 单图上限(解码前):与 agent-core 的 MAX_DECODE_BYTES 同量级的入口防御。 */
const MAX_INBOUND_IMAGE_BYTES = 32 * 1024 * 1024;

/** 非图片 data-URL / 超限 / 解码失败 / 压缩失败时抛出(路由层映射为 400)。 */
export class PromptImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptImageError';
  }
}

export async function promptImagesToParts(
  images: readonly PromptImageBody[],
  config: ByfConfig,
): Promise<PromptPart[]> {
  const limits = new ImageLimits(process.env, config.image);
  const parts: PromptPart[] = [];
  for (const image of images) {
    parts.push(await promptImageToPart(image, limits.maxEdgePx()));
  }
  return parts;
}

async function promptImageToPart(image: PromptImageBody, maxEdgePx: number): Promise<PromptPart> {
  if (typeof image.dataUrl !== 'string') {
    throw new PromptImageError('images[].dataUrl must be a string');
  }
  const match = image.dataUrl.match(DATA_IMAGE_URL);
  if (match === null) {
    throw new PromptImageError('images[].dataUrl must be a base64 data:image/* URL');
  }
  const [, rawMime, rawBase64] = match;
  if (rawMime === undefined || rawBase64 === undefined) {
    throw new PromptImageError('images[].dataUrl must be a base64 data:image/* URL');
  }
  const bytes = Buffer.from(rawBase64, 'base64');
  if (bytes.length === 0) {
    throw new PromptImageError('images[].dataUrl has empty payload');
  }
  if (bytes.length > MAX_INBOUND_IMAGE_BYTES) {
    throw new PromptImageError('image attachment too large');
  }
  // 与 TUI 同策略:压缩失败不阻塞提交,回退原图。
  const result = await compressImageForModel({
    data: bytes,
    mimeType: rawMime,
    maxEdgePx,
  });
  const data = result.outcome.kind === 'error' ? bytes : result.data;
  const mimeType = result.outcome.kind === 'error' ? rawMime : result.mimeType;
  return {
    type: 'image_url',
    imageUrl: { url: `data:${mimeType};base64,${data.toString('base64')}` },
  };
}
