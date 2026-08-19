/**
 * 探测 `fd` 二进制,使 pi-tui 的 `CombinedAutocompleteProvider` 能启用
 * 跨目录模糊文件搜索。
 *
 * 各发行版命名不同:
 *   - Homebrew / Arch / 多数 Linux:`fd`
 *   - Debian / Ubuntu:`fdfind`
 *
 * 我们用 `spawnSync(..., { stdio: 'ignore' })` 而非 shell 出去调 `which`,
 * 使检查不依赖父 shell 的 PATH 解析语义,并在启动时保持廉价(~毫秒)。
 */

import { spawnSync } from 'node:child_process';

const CANDIDATES = ['fd', 'fdfind'];

export function detectFdPath(): string | null {
  for (const name of CANDIDATES) {
    try {
      const result = spawnSync(name, ['--version'], { stdio: 'ignore' });
      if (result.status === 0) return name;
    } catch {
      // ENOENT, EACCES, etc. — try next candidate
    }
  }
  return null;
}
