/**
 * 扫描提交的文本中的媒体占位符,生成要发送到 SDK prompt 端点的
 * `PromptPart[]`。
 *
 * 规则:
 *   - 只有能对照 `store` 解析的占位符才被提取。用户自己输入的
 *     字面量 `[image #999 ...]` 保留在文本中(我们不能为它臆造文件)。
 *   - 文本 / 图片 / 视频段的顺序被保留。图片占位符展开为图片内容 part,
 *     使提示词无需依赖模型工具调用即可到达 provider。视频占位符仍展开为
 *     文件路径标签,让 `ReadMediaFile` 负责视频上传行为。
 *   - 相邻文本段被展平——空 / 仅空白的段被丢弃,避免在两个媒体 part 之间
 *     发出 `{type:'text', text:' '}` 噪声。
 */

import type { PromptPart } from '@byfriends/sdk';

import type {
  ImageAttachment,
  ImageAttachmentStore,
  VideoAttachment,
} from './image-attachment-store';

const PLACEHOLDER_REGEX = /\[(image|video) #(\d+) (?:(\(\d+×\d+\))|([^\]]+))\]/g;

export interface ExtractionResult {
  /** Flat list of parts in input order; empty array when no media matched. */
  parts: PromptPart[];
  /**
   * Did we find at least one matching attachment? When false, callers
   * should keep the prompt on the plain text path.
   */
  hasMedia: boolean;
  /** Image attachment ids matched, in the order they appeared. */
  imageAttachmentIds: number[];
  /** Video attachment ids matched, in the order they appeared. */
  videoAttachmentIds: number[];
}

export function extractMediaAttachments(
  text: string,
  store: ImageAttachmentStore,
): ExtractionResult {
  const parts: PromptPart[] = [];
  const imageAttachmentIds: number[] = [];
  const videoAttachmentIds: number[] = [];
  let cursor = 0;
  let hasMedia = false;

  PLACEHOLDER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PLACEHOLDER_REGEX.exec(text)) !== null) {
    const [literal, kind, idStr] = match;
    if (kind !== 'image' && kind !== 'video') continue;
    if (idStr === undefined) continue;
    const id = Number.parseInt(idStr, 10);
    const attachment = store.get(id);
    if (attachment === undefined) continue; // stale / user-typed — leave as text
    if (attachment.kind !== kind) continue;
    const before = text.slice(cursor, match.index);
    pushText(parts, before);
    if (attachment.kind === 'video') {
      const mediaText = tagTextForVideo(attachment);
      pushText(parts, mediaText);
      videoAttachmentIds.push(id);
    } else {
      parts.push(imagePartForAttachment(attachment));
      imageAttachmentIds.push(id);
    }
    hasMedia = true;
    cursor = match.index + literal.length;
  }
  const tail = text.slice(cursor);
  pushText(parts, tail);

  return {
    // Text-only submissions drop the synthesised parts array — the
    // caller's contract is "parts is meaningful iff hasMedia", and
    // emitting a stray TextPart confuses consumers that branch on
    // `parts.length > 0`.
    parts: hasMedia ? parts : [],
    hasMedia,
    imageAttachmentIds,
    videoAttachmentIds,
  };
}

function pushText(parts: PromptPart[], segment: string): void {
  if (segment.length === 0) return;
  // Keep whitespace-only segments only when they sit between non-empty
  // text elsewhere — the simpler rule "drop everything whitespace-only"
  // is fine here because the LLM doesn't care about inter-image spaces.
  if (segment.trim().length === 0) return;
  const last = parts.at(-1);
  if (last?.type === 'text') {
    parts[parts.length - 1] = { type: 'text', text: last.text + segment };
    return;
  }
  parts.push({ type: 'text', text: segment });
}

function imagePartForAttachment(att: ImageAttachment): PromptPart {
  const base64 = Buffer.from(att.bytes).toString('base64');
  return {
    type: 'image_url',
    imageUrl: { url: `data:${att.mime};base64,${base64}` },
  };
}

function tagTextForVideo(att: VideoAttachment): string {
  return formatMediaTag('video', att.sourcePath);
}

function formatMediaTag(tag: 'image' | 'video', path: string): string {
  return `<${tag} path="${escapeAttribute(path)}"></${tag}>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
