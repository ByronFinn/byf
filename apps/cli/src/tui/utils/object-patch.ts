// 当应用 `patch` 至少会改变一个自有属性时返回 true。
// 用于 UI 刷新路径之前,使重复的等价状态补丁保持廉价。
export function hasPatchChanges<T extends object>(target: T, patch: Partial<T>): boolean {
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (!Object.is(target[key], patch[key])) return true;
  }
  return false;
}
