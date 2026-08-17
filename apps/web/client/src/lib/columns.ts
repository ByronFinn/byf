/**
 * 三栏 AppFrame 的纯几何求解器（移植自 deepseek-harness
 * `packages/client/ui-layout/src/client/columns.ts`，PRD-0035 R-C3 / T1）。
 *
 * 折叠链契约：优先保证 center ≥ CENTER_MIN（先收缩 details，再自动关闭
 * details〔派生零宽——偏好值永不改写，窗口恢复时宽度自动还原〕）。sidebar
 * 永不让步：渲染宽度总是拖拽偏好（或折叠 rail），center 作为最后手段吸收
 * 剩余缺口。输入是布局 store 的宽度偏好（0 = 关闭）；关闭的 sidebar 解析为
 * 固定 SIDEBAR_COLLAPSED 控制 rail，关闭的 details 解析为零宽。
 * SIDEBAR_AUTO_COLLAPSE 断点由 AppFrame 消费（决定有效 sidebar 偏好），
 * 求解器本身与断点无关。
 */

/** 一次 frame 求解的宽度；center 仅在最后回退时可低于 CENTER_MIN。 */
export interface Columns {
  sidebar: number;
  center: number;
  details: number;
}

/** 契约冻结的几何：三栏折叠链的固定点。 */
/** Center 下限；只有最后回退允许低于它。 */
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
/** Details 拖拽钳制下限。 */
export const DETAILS_MIN = 300;
/** Details 拖拽钳制上限。 */
export const DETAILS_MAX = 520;
/** 任何用户拖拽前的 details 宽度。 */
export const DETAILS_DEFAULT = 360;

/** 把面板宽度钳制进其契约范围。 */
export function clampWidth(px: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(px)));
}

/** 求解一次 frame 的三栏宽度。纯函数：无迟滞——输出只是 (viewport,
 *  preferences) 的函数，窗口重新变宽时自动恢复。偏好在此处重新钳制，
 *  因为跨越 store 边界后调用方可能仍提供过期范围。
 * @param viewport 可用 frame 宽度(px)。
 * @param sidebar sidebar 宽度偏好(px;0 = 关闭)。
 * @param details details 宽度偏好(px;0 = 关闭)。
 * @returns 求解宽度；details 0 = 视觉关闭(不卸载子树)，关闭的 sidebar 保留
 *   紧凑 rail。
 */
export function computeColumns(viewport: number, sidebar: number, details: number): Columns {
  // Sidebar 固定在其偏好(或 rail)——永不让步。
  const s = sidebar === 0 ? SIDEBAR_COLLAPSED : clampWidth(sidebar, SIDEBAR_MIN, SIDEBAR_MAX);
  const d0 = details === 0 ? 0 : clampWidth(details, DETAILS_MIN, DETAILS_MAX);

  // Step 1:所有列在偏好宽度下放得下。
  if (s + d0 + CENTER_MIN <= viewport)
    return { sidebar: s, center: viewport - s - d0, details: d0 };

  // Step 2:details 收缩到其下限。
  const d1 = d0 === 0 ? 0 : Math.max(DETAILS_MIN, viewport - s - CENTER_MIN);
  if (s + d1 + CENTER_MIN <= viewport) return { sidebar: s, center: CENTER_MIN, details: d1 };

  // Step 3:自动关闭 details(派生——偏好未动);center 吸收剩余缺口(可低于 CENTER_MIN)。
  return { sidebar: s, center: Math.max(0, viewport - s), details: 0 };
}
