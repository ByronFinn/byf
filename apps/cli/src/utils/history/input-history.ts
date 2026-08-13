/**
 * 用户输入历史持久化——JSONL 文件,每行 `{"content": "..."}`。
 *
 * 语义:
 * - 每行一个 JSON 对象(`InputHistoryEntry { content }`)
 * - 只追加写入
 * - 跳过空条目
 * - 与最后一条相同时跳过(连续去重)
 * - 容忍损坏行:记录 + 跳过,不中止加载
 */

import { z } from 'zod';

import { appendJsonlLine, readJsonlFile } from '#/utils/persistence';

export interface InputHistoryEntry {
  content: string;
}

const InputHistoryEntrySchema: z.ZodType<InputHistoryEntry> = z.object({
  content: z.string(),
});

export async function loadInputHistory(file: string): Promise<InputHistoryEntry[]> {
  return readJsonlFile(file, InputHistoryEntrySchema);
}

/**
 * 向历史文件追加条目。写入时返回 true;跳过(空或等于 `lastContent`)
 * 时返回 false。
 */
export async function appendInputHistory(
  file: string,
  text: string,
  lastContent?: string,
): Promise<boolean> {
  const content = text.trim();
  if (content.length === 0) return false;
  if (content === lastContent) return false;
  await appendJsonlLine(file, InputHistoryEntrySchema, { content });
  return true;
}
