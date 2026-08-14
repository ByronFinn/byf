import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Markdown 代码块(R6):语言 banner + 复制按钮 + Shiki 高亮。
 * 流式期间(streaming)渲染纯文本,turn settle 后一次性上色(R10 / ADR 0035 D4)。
 * highlighter 模块动态导入:整个 Shiki vendor chunk 首次渲染代码块时才加载。
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

  useEffect(() => {
    if (streaming) return;
    let cancelled = false;
    setHtml(null);
    void import('#/lib/highlighter')
      .then(({ highlightCode: highlight }) => highlight(code, language))
      .then((result) => {
        if (!cancelled) setHtml(result);
      });
    return () => {
      cancelled = true;
    };
  }, [code, language, streaming]);

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
          aria-label="Copy code"
          className="flex items-center rounded-sm p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
        >
          {copied ? (
            <Check className="size-3.5 text-state-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </button>
      </div>
      {html !== null ? (
        <div className="codeblock-highlight" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-code-fg">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}
