import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type MermaidState =
  | { phase: 'idle' }
  | { phase: 'rendered'; svg: string }
  | { phase: 'failed'; message: string };

/**
 * 监听 <html> 主题类切换(useTheme / boot 脚本翻转 theme-dark / theme-light),
 * 返回递增序号。mermaid 的主题在渲染时读取当前类,切换后必须重渲染才能换色。
 */
function useThemeClassVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setVersion((v) => v + 1);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return version;
}

/**
 * Mermaid 图渲染(PRD-0034 R-C4):settle 后经 dynamic import 懒加载 mermaid
 * (独立 vendor chunk,对齐 Shiki 懒加载先例);渲染失败降级回代码块并提示。
 * 主题跟随:读取 html 上的深浅主题类切换 mermaid 主题,主题类变化时重渲染。
 */
function useMermaid(code: string, streaming: boolean, themeVersion: number): MermaidState {
  const [state, setState] = useState<MermaidState>({ phase: 'idle' });

  useEffect(() => {
    if (streaming) {
      setState({ phase: 'idle' });
      return;
    }
    let cancelled = false;
    setState({ phase: 'idle' });
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        const dark = document.documentElement.classList.contains('theme-dark');
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(
          `mmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          code,
        );
        if (!cancelled) setState({ phase: 'rendered', svg });
      } catch (error) {
        if (!cancelled) {
          setState({
            phase: 'failed',
            message: error instanceof Error ? error.message : 'mermaid render failed',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, streaming, themeVersion]);

  return state;
}

/**
 * Markdown 代码块(R6):语言 banner + 复制按钮 + Shiki 高亮。
 * 流式期间(streaming)渲染纯文本,turn settle 后一次性上色(R10 / ADR 0035 D4)。
 * highlighter 模块动态导入:整个 Shiki vendor chunk 首次渲染代码块时才加载。
 * lang=mermaid 的块 settle 后渲染为图表(R-C4),失败降级回代码块。
 */
export function CodeBlock(props: {
  code: string;
  language: string;
  streaming: boolean;
}): React.JSX.Element {
  const { code, language, streaming } = props;
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(0);
  const isMermaid = language === 'mermaid';
  const themeVersion = useThemeClassVersion();
  const mermaid = useMermaid(isMermaid ? code : '', isMermaid ? streaming : true, themeVersion);

  useEffect(() => {
    if (streaming || isMermaid) return;
    let cancelled = false;
    setHtml(null);
    void import('#/lib/highlighter')
      .then(({ highlightCode: highlight }) => highlight(code, language))
      .then((result) => {
        if (!cancelled) setHtml(result);
      })
      .catch(() => {
        /* chunk 加载/高亮失败:保持纯文本回退 */
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, streaming, isMermaid]);

  useEffect(() => {
    return () => {
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      /* 剪贴板不可用时静默 */
    }
  };

  const label = language.length > 0 ? language : 'text';

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-code shadow-1">
      <div className="flex items-center justify-between border-b border-border px-3 py-1">
        <span className="font-mono text-xs text-code-fg">{label}</span>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="复制代码"
          className="flex items-center rounded-sm p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          {copied ? (
            <Check className="size-3.5 text-state-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      {isMermaid && mermaid.phase === 'rendered' ? (
        <div
          className="flex justify-center overflow-x-auto bg-bg p-3 [&>svg]:max-h-[480px]"
          data-mermaid
          dangerouslySetInnerHTML={{ __html: mermaid.svg }}
        />
      ) : isMermaid && mermaid.phase === 'failed' ? (
        <div>
          <p className="border-b border-border bg-state-error/10 px-3 py-1 text-xs text-state-error">
            Mermaid 渲染失败({mermaid.message}),已降级为源码
          </p>
          <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-code-fg">
            <code>{code}</code>
          </pre>
        </div>
      ) : html !== null ? (
        <div className="codeblock-highlight" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-code-fg">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
