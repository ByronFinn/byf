/**
 * 输入框上方的附件预览条:实时反映编辑器文本中媒体占位符引用的附件。
 *
 * 与提交提取共用 `MEDIA_PLACEHOLDER_REGEX` 与 `ImageAttachmentStore`,因此
 * 「用户删掉占位符文本 → 预览同步消失」与「提交时哪些图片被展开」永远一致。
 * 图片复用 transcript 的 `ImageThumbnail`(预览用小行高),视频显示文件名标签;
 * 无匹配附件时渲染零行(Container 空态),不占输入区高度。
 */

import { Container, Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { ImageThumbnail } from '#/tui/components/media/image-thumbnail';
import type { ColorPalette } from '#/tui/theme/colors';
import type { ImageAttachmentStore, MediaAttachment } from '#/tui/utils/image-attachment-store';
import { MEDIA_PLACEHOLDER_REGEX } from '#/tui/utils/image-placeholder';

/** 预览条图片行高上限(transcript 的 12 行对输入区太占;6 行足够识别截图)。 */
const PREVIEW_MAX_ROWS = 6;

/**
 * 解析编辑器中引用到 store 的附件(按出现顺序)。与 `extractMediaAttachments`
 * 的规则一致:无法对照 store 解析的占位符(用户手打的字面量)不视为附件。
 */
export function matchMediaAttachments(
  text: string,
  store: ImageAttachmentStore,
): MediaAttachment[] {
  MEDIA_PLACEHOLDER_REGEX.lastIndex = 0;
  const found: MediaAttachment[] = [];
  let match: RegExpExecArray | null;
  while ((match = MEDIA_PLACEHOLDER_REGEX.exec(text)) !== null) {
    const kind = match[1];
    const idStr = match[2];
    if (kind !== 'image' && kind !== 'video') continue;
    if (idStr === undefined) continue;
    const id = Number.parseInt(idStr, 10);
    const attachment = store.get(id);
    if (attachment === undefined || attachment.kind !== kind) continue;
    found.push(attachment);
  }
  return found;
}

export class AttachmentPreviewStrip extends Container {
  /** 上次 sync 展示的附件 id(顺序敏感),用于避免无谓重建子组件。 */
  private lastIds: number[] = [];

  constructor(
    private readonly store: ImageAttachmentStore,
    private readonly colors: ColorPalette,
  ) {
    super();
  }

  /**
   * 按编辑器当前文本重算预览。返回 true 表示预览内容发生了实质变化
   * (宿主据此触发重绘)。
   */
  sync(text: string): boolean {
    const attachments = matchMediaAttachments(text, this.store);
    const ids = attachments.map((a) => a.id);
    if (sameIds(this.lastIds, ids)) return false;
    this.lastIds = ids;
    this.clear();
    for (const attachment of attachments) {
      if (attachment.kind === 'image') {
        this.addChild(new ImageThumbnail(attachment, this.colors, { maxRows: PREVIEW_MAX_ROWS }));
      } else {
        this.addChild(new Text(chalk.hex(this.colors.accent)(attachment.placeholder), 0, 0));
      }
    }
    return true;
  }
}

function sameIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}
