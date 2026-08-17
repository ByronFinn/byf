/**
 * 统一 right details 宿主（PRD-0035 R-D2 / AC-A12）。
 *
 * 三栏骨架的第三栏内容由全局 context 驱动：任何组件（wire 行、子 agent、
 * 文件路径、json 行）都可把详情推入右侧 details 列；AppShell 的 DetailsHost
 * 渲染 context 内容，空时显示 deepseek 同款空态。
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface DetailsContextValue {
  /** 当前详情内容；null = 空态。 */
  readonly content: ReactNode;
  readonly setContent: (node: ReactNode | null) => void;
}

const DetailsContext = createContext<DetailsContextValue | null>(null);

export function DetailsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [content, setContent] = useState<ReactNode>(null);
  const value = useMemo<DetailsContextValue>(() => ({ content, setContent }), [content]);
  return <DetailsContext.Provider value={value}>{children}</DetailsContext.Provider>;
}

/** 读取并设置右侧 details 内容。必须在 DetailsProvider 内使用。 */
export function useDetails(): DetailsContextValue {
  const ctx = useContext(DetailsContext);
  if (ctx === null) {
    throw new Error('useDetails must be used within DetailsProvider');
  }
  return ctx;
}

/** 把详情推入 details 列的便捷封装（组件卸载/切换时清空）。 */
export function useDetailsSetter(): (node: ReactNode | null) => void {
  const { setContent } = useDetails();
  return useCallback((node: ReactNode | null) => setContent(node), [setContent]);
}
