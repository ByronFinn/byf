/**
 * 粘贴进输入框的媒体注册表。
 *
 * 每次粘贴产生一个带自增 id 的 `ImageAttachment`,或带人类可读占位符的
 * `VideoAttachment`(`[image #1 (640×480)]` / `[video #2 sample.mov]`)。
 * 占位符是用户在输入字段中看到的内容;提交时,`extractMediaAttachments`
 * 遍历文本,把图片占位符展开为图片内容 part,视频占位符展开为
 * `ReadMediaFile` 的文件路径标签。
 *
 * 作用域为每个 `ByfTui` 实例。重载(`/new`、`/clear`、切换会话)调用
 * `clear()`,使 id 从 1 重新开始,过期提示附件被丢弃。我们刻意**不**跨会话
 * 持久化附件——coding-agent 也不这么做,且 `--resume` 无从物化这些文件。
 */

export interface ImageAttachment {
  readonly id: number;
  readonly kind: 'image';
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  /** Rendered placeholder string, e.g. `[image #1 (640×480)]`. */
  readonly placeholder: string;
}

export interface VideoAttachment {
  readonly id: number;
  readonly kind: 'video';
  readonly mime: string;
  readonly filename: string;
  readonly sourcePath: string;
  readonly label: string;
  /** Rendered placeholder string, e.g. `[video #1 sample.mov]`. */
  readonly placeholder: string;
}

export type MediaAttachment = ImageAttachment | VideoAttachment;

export class ImageAttachmentStore {
  private nextId = 1;
  private readonly byId = new Map<number, MediaAttachment>();

  addImage(bytes: Uint8Array, mime: string, width: number, height: number): ImageAttachment {
    const id = this.nextId;
    this.nextId += 1;
    const attachment: ImageAttachment = {
      id,
      kind: 'image',
      bytes,
      mime,
      width,
      height,
      placeholder: formatPlaceholder(id, width, height),
    };
    this.byId.set(id, attachment);
    return attachment;
  }

  addVideo(mime: string, sourcePath: string, filename?: string): VideoAttachment {
    const id = this.nextId;
    this.nextId += 1;
    const normalizedFilename = basenameLike(
      filename !== undefined && filename !== '' ? filename : sourcePath,
    );
    const label = sanitizeVideoLabel(normalizedFilename.length > 0 ? normalizedFilename : mime);
    const attachment: VideoAttachment = {
      id,
      kind: 'video',
      mime,
      filename: normalizedFilename,
      sourcePath,
      label,
      placeholder: formatVideoPlaceholder(id, label),
    };
    this.byId.set(id, attachment);
    return attachment;
  }

  get(id: number): MediaAttachment | undefined {
    return this.byId.get(id);
  }

  clear(): void {
    this.byId.clear();
    this.nextId = 1;
  }

  size(): number {
    return this.byId.size;
  }
}

export function formatPlaceholder(id: number, width: number, height: number): string {
  return `[image #${String(id)} (${String(width)}×${String(height)})]`;
}

export function formatVideoPlaceholder(id: number, label: string): string {
  return `[video #${String(id)} ${sanitizeVideoLabel(label)}]`;
}

function sanitizeVideoLabel(raw: string): string {
  let label = '';
  for (const char of raw) {
    const code = char.codePointAt(0);
    label +=
      code === undefined || code < 0x20 || code === 0x7f || char === '[' || char === ']'
        ? '_'
        : char;
  }
  label = label.trim();
  return label.length > 0 ? label : 'video';
}

function basenameLike(raw: string): string {
  const parts = raw.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? raw;
}
