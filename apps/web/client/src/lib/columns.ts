/**
 * AppFrame 的纯几何求解器（前身为三栏 PRD-0035 R-C3；details 列已改为非模态
 * 浮动抽屉 `DetailsDrawer`，不参与网格渲染，展开时经 `resolveDrawerPush` 从
 * center 预留宽度让位）。
 *
 * 折叠链契约：sidebar 永不让步——渲染宽度总是拖拽偏好（或折叠 rail），
 * center 作为最后手段吸收剩余缺口（可低于 CENTER_MIN）。输入是布局 store
 * 的宽度偏好（0 = 关闭）；关闭的 sidebar 解析为固定 SIDEBAR_COLLAPSED 控制
 * rail。SIDEBAR_AUTO_COLLAPSE 断点由 AppFrame 消费（决定有效 sidebar 偏好），
 * 求解器本身与断点无关。
 */

/** 一次 frame 求解的宽度；center 仅在最后回退时可低于 CENTER_MIN。 */
export interface Columns {
  sidebar: number;
  center: number;
}

/** 契约冻结的几何：两栏折叠链的固定点。 */
/** Center 下限；只有最后回退允许低于它。两栏求解器不再直接引用,但作为
 *  契约文档与测试钉住的几何下限保留（PRD-0035 冻结契约的一部分）。 */
export const CENTER_MIN = 640;
/** Sidebar 拖拽钳制下限。 */
export const SIDEBAR_MIN = 264;
/** Sidebar 拖拽钳制上限。 */
export const SIDEBAR_MAX = 420;
/** 任何用户拖拽前的 sidebar 宽度。 */
export const SIDEBAR_DEFAULT = 280;
/** 关闭的 sidebar rail：16px 水平内边距之间的 24px 图标列。 */
export const SIDEBAR_COLLAPSED = 56;
/** 低于此视口宽度时 sidebar 自动折叠为 rail（deepseek LG 断点）；断点以下
 *  手动展开会覆盖被挤压的 center（stores.ts narrowExpanded）。 */
export const SIDEBAR_AUTO_COLLAPSE = 1024;

/** 把面板宽度钳制进其契约范围。 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)));
}

/**
 * 抽屉推挤契约（2026-08-19 之后）：DetailsDrawer 为「非模态浮动抽屉」，但
 * 展开时 center 需要让位回流（否则浮层盖住内容、页面不协调）。本函数求解
 * 「画出抽屉渲染宽度后，center 是否仍保得住下限」：够用则返回应预留的宽度
 * （center 让出该宽度），否则返回 0（抽屉退回纯浮层覆盖、center 不回退）。
 * 输入 `drawerWidth` 应为抽屉的实际渲染宽度（`min(偏好, 92vw)`）。
 */
export const CENTER_PUSH_FLOOR = 360;

export function resolveDrawerPush(viewport: number, sidebar: number, drawerWidth: number): number {
  const roomAfterSidebar = viewport - sidebar;
  if (roomAfterSidebar - drawerWidth < CENTER_PUSH_FLOOR) return 0;
  return Math.min(drawerWidth, roomAfterSidebar);
}

/** 求解一次 frame 的两栏宽度。纯函数：无迟滞——输出只是 (viewport,
 *  preference) 的函数。偏好在此处重新钳制，因为跨越 store 边界后调用方
 *  可能仍提供过期范围。
 * @param viewport 可用 frame 宽度(px)。
 * @param sidebar sidebar 宽度偏好(px;0 = 关闭)。
 * @returns 求解宽度；关闭的 sidebar 保留紧凑 rail。
 */
export function computeColumns(viewport: number, sidebar: number): Columns {
  // Sidebar 固定在其偏好(或 rail)——永不让步;center 吸收剩余缺口。
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX);
  return { sidebar: s, center: Math.max(0, viewport - s) };
}
