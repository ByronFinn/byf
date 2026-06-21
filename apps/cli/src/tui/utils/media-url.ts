import { formatBytes } from '#/utils/format';

export type MediaUrlKind = 'audio' | 'image' | 'video';

export function mediaUrlPartToText(kind: MediaUrlKind, url: string): string {
  const summary = summarizeDataUrl(url);
  if (summary !== undefined) {
    const size = summary.bytes !== undefined ? `, ${formatBytes(summary.bytes)}` : '';
    return `[${kind} ${summary.mime}${size}]`;
  }
  return `<${kind} url="${escapeAttribute(url)}">`;
}

export function summarizeDataUrl(url: string): { mime: string; bytes?: number } | undefined {
  if (!url.startsWith('data:')) return undefined;
  const commaIndex = url.indexOf(',');
  const header =
    commaIndex >= 0 ? url.slice('data:'.length, commaIndex) : url.slice('data:'.length);
  const data = commaIndex >= 0 ? url.slice(commaIndex + 1) : '';
  const [rawMime, ...params] = header.split(';');
  const mime = rawMime !== undefined && rawMime.length > 0 ? rawMime : 'application/octet-stream';
  const isBase64 = params.some((param) => param.toLowerCase() === 'base64');
  return {
    mime,
    bytes: isBase64 ? estimateBase64Bytes(data) : undefined,
  };
}

function estimateBase64Bytes(data: string): number {
  const compact = data.replaceAll(/\s/g, '');
  if (compact.length === 0) return 0;
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
