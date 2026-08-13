/**
 * 外部编辑器辅助——在预置当前编辑器缓冲区的临时文件上拉起
 * $VISUAL / $EDITOR(或配置的命令),然后读回编辑后的内容。
 *
 * 解析优先级:
 *   配置的(来自 Core/SDK 默认或 `/editor`)>
 *   $VISUAL > $EDITOR > undefined(调用方处理「无编辑器」toast)。
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function resolveEditorCommand(configured?: string | null): string | undefined {
  const candidates = [configured, process.env['VISUAL'], process.env['EDITOR']];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      return c.trim();
    }
  }
  return undefined;
}

/**
 * 对预置 `initialText` 的临时文件拉起 `command`(经 shell 分词)。
 * 成功时返回编辑后的内容;编辑器以非零退出或文件消失时返回 `undefined`。
 *
 * 命令传给 `/bin/sh -c "<cmd> <tmpfile>"`,使用户可提供 `"code --wait"`
 * 或 `"nvim +set ft=markdown"` 这类 argv 风格字符串。
 */
export async function editInExternalEditor(
  initialText: string,
  command: string,
): Promise<string | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-edit-'));
  const file = join(dir, 'prompt.md');
  await writeFile(file, initialText, 'utf-8');
  try {
    const code = await new Promise<number>((resolve, reject) => {
      const shellCmd = `${command} ${shellQuote(file)}`;
      const child = spawn('/bin/sh', ['-c', shellCmd], { stdio: 'inherit' });
      child.on('exit', (c) => {
        resolve(c ?? 0);
      });
      child.on('error', reject);
    });
    if (code !== 0) return undefined;
    return await readFile(file, 'utf-8');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {
      // best-effort cleanup
    });
  }
}

function shellQuote(path: string): string {
  // Single-quote and escape any embedded single quotes.
  return `'${path.replaceAll("'", "'\\''")}'`;
}
