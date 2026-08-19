/**
 * 详情抽屉的纯状态逻辑（details-context 的可测部分，测试见
 * `test/details-state.test.ts`）。
 *
 * reveal 契约：仅「用户显式查看」的推入才唤出抽屉——`reveal === true`
 * 且内容非 null（tab 默认内容等静默更新不唤出）。
 * title 契约：推入 null 或未带 title 时清空标题，回到「详情」默认。
 */
export function resolveDetailsTitle(content: unknown, title: string | undefined): string | null {
  if (content === null || title === undefined) return null;
  return title;
}

export function shouldRevealOnPush(reveal: boolean | undefined, content: unknown): boolean {
  return reveal === true && content !== null;
}

/** localStorage 读取的回退语义：'1'=开、其余/抛异常=关。 */
export function readDetailsOpenPref(read: () => string | null): boolean {
  try {
    return read() === '1';
  } catch {
    return false;
  }
}
