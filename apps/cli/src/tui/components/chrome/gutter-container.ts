/**
 * 在子元素周围保留左 / 右沟槽列的 Container,使 chrome(状态行、transcript、
 * 面板)与输入框的内部内容区对齐,而不是紧贴终端边缘。
 *
 * 子元素以 `width - left - right` 渲染,每行发出时前缀 `left` 个普通空格。
 * 右内边距仅是逻辑上的——我们绝不发出尾随空格,因为终端已把背景绘制到
 * 边缘,追加它们只会徒增 diff 渲染器的变动。
 */

import { Container } from '@earendil-works/pi-tui';

export class GutterContainer extends Container {
  constructor(
    private readonly leftPad: number,
    private readonly rightPad: number,
  ) {
    super();
  }

  override render(width: number): string[] {
    const inner = Math.max(1, width - this.leftPad - this.rightPad);
    const lead = ' '.repeat(this.leftPad);
    const out: string[] = [];
    for (const child of this.children) {
      for (const line of child.render(inner)) {
        out.push(lead + line);
      }
    }
    return out;
  }
}
