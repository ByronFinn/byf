/**
 * 统一 right details 宿主（PRD-0035 R-D2 / AC-A12；details 列已改为非模态
 * 浮动抽屉）。
 *
 * 交互契约（折叠 vs 查看，全站统一的 affordance 区分）：
 * - 折叠 = 行内披露：内容属于时间线的当前节拍、轻量有界（thinking、
 *   工具 I/O 摘要）。行尾用旋转 chevron（▸↔▾）+ aria-expanded。
 * - 查看 = 抽屉深查：内容是独立实体（子代理、文件、后台任务、wire 记录），
 *   结构化、位置无关、需与主内容并排检视。行尾用 PanelRightOpen 图标
 *   （永不旋转）+「在详情面板查看」提示 + aria-label。
 * - 整行/整卡可点击的查看目标，行尾必须是查看图标而非折叠 chevron；
 *   一次点击绝不同时触发折叠与弹抽屉（wire 行拆分为两个控件）。
 *
 * 抽屉内容由全局 context 驱动：任何组件都可把详情推入抽屉；`reveal` 标记
 * 「用户显式查看」的推入（查看图标/卡片点击），会同时唤出抽屉；tab 默认
 * 内容（如 Chat 页实时 State）静默更新、不打扰。开合状态与宽度由
 * DetailsDrawer 持久化到 localStorage（R-C6：UI 偏好不入 config.toml）。
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { readDetailsOpenPref, resolveDetailsTitle, shouldRevealOnPush } from '#/lib/details-state';

const LS_OPEN = 'byf.layout.drawer.open';

interface DetailsPushOptions {
  /** true = 推入内容的同时唤出抽屉（用户显式查看动作）。 */
  readonly reveal?: boolean;
  /** 抽屉头部标题；缺省显示「详情」。 */
  readonly title?: string;
}

interface DetailsContextValue {
  /** 当前详情内容；null = 空态。 */
  readonly content: ReactNode;
  readonly setContent: (node: ReactNode | null, opts?: DetailsPushOptions) => void;
  /** 当前头部标题；null = 默认「详情」。 */
  readonly title: string | null;
  /** 抽屉是否展开（跨会话持久化，默认收起）。 */
  readonly open: boolean;
  readonly toggle: () => void;
  readonly close: () => void;
}

const DetailsContext = createContext<DetailsContextValue | null>(null);

function readOpenPref(): boolean {
  return readDetailsOpenPref(() => localStorage.getItem(LS_OPEN));
}

function writeOpenPref(open: boolean): void {
  try {
    localStorage.setItem(LS_OPEN, open ? '1' : '0');
  } catch {
    // localStorage 不可用时开合偏好仅会话内有效
  }
}

export function DetailsProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [content, setContentState] = useState<ReactNode>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [open, setOpen] = useState(readOpenPref);

  const setContent = useCallback((node: ReactNode | null, opts?: DetailsPushOptions): void => {
    setContentState(node);
    setTitle(resolveDetailsTitle(node, opts?.title));
    if (shouldRevealOnPush(opts?.reveal, node)) setOpen(true);
  }, []);

  const toggle = useCallback((): void => {
    setOpen((v) => !v);
  }, []);

  const close = useCallback((): void => {
    setOpen(false);
  }, []);

  // 开合持久化集中在此(reveal 打开 / toggle / close 三路对称),不在
  // state updater 内做副作用(StrictMode 双调 updater 的反模式)。
  useEffect(() => {
    writeOpenPref(open);
  }, [open]);

  const value = useMemo<DetailsContextValue>(
    () => ({ content, setContent, title, open, toggle, close }),
    [content, setContent, title, open, toggle, close],
  );
  return <DetailsContext.Provider value={value}>{children}</DetailsContext.Provider>;
}

/** 读取并设置详情抽屉内容。必须在 DetailsProvider 内使用。 */
export function useDetails(): DetailsContextValue {
  const ctx = useContext(DetailsContext);
  if (ctx === null) {
    throw new Error('useDetails must be used within DetailsProvider');
  }
  return ctx;
}

/** 把详情推入抽屉的便捷封装（组件卸载/切换时清空）。 */
export function useDetailsSetter(): (node: ReactNode | null, opts?: DetailsPushOptions) => void {
  const { setContent } = useDetails();
  return useCallback(
    (node: ReactNode | null, opts?: DetailsPushOptions): void => {
      setContent(node, opts);
    },
    [setContent],
  );
}
