/** 会话列表相对时间(对齐 deepseek 侧边栏的"刚刚 / N 分钟前"式显示)。 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 相对时间标签:刚刚 / N 分钟前 / N 小时前 / N 天前;超过 7 天显示日期。
 * `now` 可注入(测试 / 渲染基准)。
 */
export function relativeTimeLabel(updatedAt: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - updatedAt);
  if (diff < 60_000) return '刚刚';
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const d = new Date(updatedAt);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
