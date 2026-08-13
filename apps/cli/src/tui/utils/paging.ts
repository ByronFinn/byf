/**
 * 列表选择器(ChoicePicker、ModelSelector)共享的纯分页数学。
 *
 * 组件拥有指向其(已过滤)条目列表的单一 `selectedIndex`;页码由其派生,
 * 因此 ↑↓ 可平滑跨页移动光标,而视图仍显示明确的页码。
 */

export interface PageView {
  /** 包含 `selectedIndex` 的页码(从 0 起)。 */
  readonly page: number;
  /** 总页数;即使列表为空也至少为 1。 */
  readonly pageCount: number;
  /** 当前页的包含式切片起点。 */
  readonly start: number;
  /** 当前页的排他式切片终点(钳制到 `total`)。 */
  readonly end: number;
}

export function pageView(total: number, selectedIndex: number, pageSize: number): PageView {
  const size = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safeIndex = total <= 0 ? 0 : Math.min(Math.max(0, selectedIndex), total - 1);
  const page = Math.min(Math.floor(safeIndex / size), pageCount - 1);
  const start = page * size;
  const end = Math.min(start + size, total);
  return { page, pageCount, start, end };
}
