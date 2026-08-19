import { CircleAlert, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '#/api';

interface TextFilePayload {
  readonly kind: 'text';
  readonly language: string;
  readonly content: string;
}

type DrawerState =
  | { phase: 'loading' }
  | { phase: 'text'; payload: TextFilePayload; html: string | null }
  | { phase: 'media'; contentType: string }
  | { phase: 'error'; message: string };

function isImageType(contentType: string): boolean {
  return contentType.startsWith('image/');
}

function isVideoType(contentType: string): boolean {
  return contentType.startsWith('video/');
}

/**
 * 文件查看内容(PRD-0034 R-C3/R-C7):工具卡片「查看」或文档路径点击后推入
 * 详情抽屉;文本经 Shiki 高亮(懒加载),图片/视频走作用域文件端点(视频
 * Range 播放)。外壳(滑入/关闭/Esc)由 DetailsDrawer 统一提供。
 */
export function FileDetail(props: { path: string }): React.JSX.Element {
  const { path } = props;
  const [state, setState] = useState<DrawerState>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    void (async () => {
      try {
        // 先 HEAD 探测内容类型:文本 → JSON + Shiki;二进制 → 直接流式引用。
        const res = await api.fetchFileHead(path);
        if (cancelled) return;
        const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
        if (contentType === 'application/json') {
          const payload = (await res.json()) as TextFilePayload;
          if (cancelled) return;
          setState({ phase: 'text', payload, html: null });
          if (payload.kind === 'text') {
            const { highlightCode } = await import('#/lib/highlighter');
            const html = await highlightCode(payload.content, payload.language);
            if (!cancelled) setState({ phase: 'text', payload, html });
          }
        } else {
          setState({ phase: 'media', contentType });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: 'error',
            message: error instanceof Error ? error.message : 'failed to load file',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-4 py-2">
        <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-fg" title={path}>
          {path}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {state.phase === 'loading' && <p className="p-4 text-sm text-fg-subtle">加载中…</p>}
        {state.phase === 'error' && (
          <p className="flex items-center gap-2 p-4 text-sm text-state-error">
            <CircleAlert className="size-4" aria-hidden />
            {state.message}
          </p>
        )}
        {state.phase === 'media' && isImageType(state.contentType) && (
          <div className="flex min-h-full items-center justify-center p-4">
            <img
              src={api.fileUrl(props.path)}
              alt={path}
              className="max-h-full max-w-full rounded-md border border-border"
            />
          </div>
        )}
        {state.phase === 'media' && isVideoType(state.contentType) && (
          <div className="flex min-h-full items-center justify-center p-4">
            <video
              src={api.fileUrl(props.path)}
              controls
              className="max-h-full max-w-full rounded-md border border-border"
            />
          </div>
        )}
        {state.phase === 'media' &&
          !isImageType(state.contentType) &&
          !isVideoType(state.contentType) && (
            <div className="p-4 text-sm text-fg-muted">
              该文件类型({state.contentType})暂不支持预览。
            </div>
          )}
        {state.phase === 'text' &&
          (state.html !== null ? (
            <div
              className="codeblock-highlight p-4 text-sm"
              dangerouslySetInnerHTML={{ __html: state.html }}
            />
          ) : (
            <pre className="p-4 font-mono text-xs whitespace-pre-wrap text-fg">
              {state.payload.content}
            </pre>
          ))}
      </div>
    </div>
  );
}
