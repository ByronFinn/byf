import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { CodeBlock } from './CodeBlock';

/** 从 react-markdown 传下来的 code 元素里递归取纯文本。 */
function flattenText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object' && 'props' in node) {
    return flattenText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return '';
}

/**
 * Markdown 渲染(R10):GFM + Shiki 代码块。流式期间 `streaming` 为 true,
 * 代码块走纯文本路径;turn settle 后上高亮。
 */
export const Markdown = memo(function Markdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-state-info underline">
              {children}
            </a>
          ),
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const className =
              typeof child === 'object' && child !== null && 'props' in child
                ? ((child as { props?: { className?: string } }).props?.className ?? '')
                : '';
            const match = /language-([\w-]+)/.exec(className);
            const code = flattenText(child).replace(/\n$/, '');
            return <CodeBlock code={code} language={match?.[1] ?? 'text'} streaming={streaming} />;
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
