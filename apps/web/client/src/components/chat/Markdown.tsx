import 'katex/dist/katex.min.css';
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { CodeBlock } from './CodeBlock';
import { openFileDrawer } from './ToolCallView';

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

/** 会话工作区内绝对路径(R-C3 可点开查看)。 */
const PATH_IN_TEXT = /(?:^|[\s(("'`])(\/[^\s"'`)]{2,})/g;

/** 把文本中的工作区绝对路径替换为可点按钮(文本节点级处理,不侵入 markdown 语法)。 */
function linkifyPaths(
  node: React.ReactNode,
  workDir: string | undefined,
  keyPrefix = '',
): React.ReactNode {
  if (typeof node !== 'string' || workDir === undefined || !workDir.startsWith('/')) return node;
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of node.matchAll(PATH_IN_TEXT)) {
    const path = match[2];
    if (path === undefined || !path.startsWith(workDir)) continue;
    const lead = match[1] ?? '';
    const start = (match.index ?? 0) + lead.length;
    if (start > cursor) parts.push(node.slice(cursor, start));
    parts.push(
      <button
        key={`${keyPrefix}-${index++}`}
        type="button"
        onClick={() => {
          openFileDrawer(path);
        }}
        className="break-all font-mono text-xs text-brand underline"
      >
        {path}
      </button>,
    );
    cursor = start + path.length;
  }
  if (parts.length === 0) return node;
  if (cursor < node.length) parts.push(node.slice(cursor));
  return parts;
}

function mapTextChildren(
  children: React.ReactNode,
  workDir: string | undefined,
  keyPrefix = '',
): React.ReactNode {
  if (Array.isArray(children)) {
    return children.map((child, i) => mapTextChildren(child, workDir, `${keyPrefix}-${i}`));
  }
  return linkifyPaths(children, workDir, keyPrefix);
}

/**
 * Markdown 渲染(R10):GFM + Shiki 代码块 + LaTeX(R-C5,settle 后渲染)+ 宽表格
 * 横向滚动(R-C6)+ 工作区路径可点(R-C3)。流式期间 `streaming` 为 true,代码块
 * 与公式走纯文本路径;turn settle 后上高亮/公式渲染(沿 PRD-0033 决策)。
 */
export const Markdown = memo(function Markdown({
  children,
  streaming = false,
  workDir,
}: {
  children: string;
  streaming?: boolean;
  workDir?: string;
}): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={streaming ? [] : [rehypeKatex]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-state-info underline">
              {children}
            </a>
          ),
          p: ({ children }) => <p>{mapTextChildren(children, workDir, 'p')}</p>,
          li: ({ children }) => <li>{mapTextChildren(children, workDir, 'li')}</li>,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table>{children}</table>
            </div>
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
