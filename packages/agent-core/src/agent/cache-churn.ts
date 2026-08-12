/**
 * 静态前缀指纹比对 —— 破坏侧归因的核心（PRD-0029 R2/R3）。
 *
 * 读侧命中率（PRD-0007）回答「缓存工作吗」；本模块回答「谁打破了前缀」。比对的是
 * **静态前缀**：桩1（PromptPlan 各块）+ 桩2（tools 数组）。桩3/桩4（每请求动态消息
 * 锚点）与压缩后历史前缀不参与比对——压缩是预期内、且应当改写历史前缀的事件，报为
 * churn 边际价值低（详见 PRD-0029 Decision / CONTEXT.md「破坏侧归因」）。
 *
 * 本模块为纯函数，便于单测；Agent 持 in-memory 上一 turn 快照，每 turn 调用
 * {@link diffStaticPrefix} 检测变化并 dispatch `context.cache_churn`。
 *
 * 指纹口径与 `buildLlmConfigSignature`（agent/index.ts）一致：块按 `块名 → SHA256(text)`，
 * tools 按确定性排序后的 `{name,description,parameters}` JSON 的 SHA256。tools 的排序
 * 稳定性由 tool/index.ts 的确定性排序保证，故桩2 用单一聚合 hash 即可（无需逐工具）。
 */

import { createHash } from 'node:crypto';

import type { CacheScope, PromptPlan, Tool } from '@byfriends/kosong';

/** SHA256(content)，与 agent/index.ts 的 `fingerprint` 同口径。 */
function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 桩2（tools 数组）的聚合指纹。仅取 `{name,description,parameters}`，与
 * `buildLlmConfigSignature` 完全同口径，确保比对与签名去重一致。
 */
export function computeToolsHash(tools: readonly Tool[]): string {
  const toolsForSignature = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  return sha256(JSON.stringify(toolsForSignature));
}

/**
 * 桩1（PromptPlan 各块）的逐块指纹。返回 `块名 → SHA256(text)`。
 * 与 agent/index.ts 的 `extractCacheBlockHashes` 同口径。
 */
export function extractCacheBlockHashes(promptPlan: PromptPlan): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const block of promptPlan.blocks) {
    hashes[block.name] = sha256(block.text);
  }
  return hashes;
}

/** 静态前缀快照（桩1 逐块哈希 + 桩2 toolsHash），作为 turn 间比对的基线。 */
export interface StaticPrefixSnapshot {
  /** 桩1：`块名 → SHA256(text)`。 */
  readonly blocks: Record<string, string>;
  /** 桩2：tools 数组的聚合 SHA256。 */
  readonly toolsHash: string;
}

/**
 * 一次检测到的静态前缀变化（dispatch 为 `context.cache_churn` 的 payload 形状）。
 *
 * `blockName` 为 PromptPlan 块名，或桩2 的固定标识 `'tools'`。`cacheScope` 取**当前**
 * 块的 scope（scope 是位置性、非内容性，通常跨 turn 稳定）；tools 桩用 `'global'`。
 * 新增块无 `beforeHash`（此前未出现），删除块无 `afterHash`（当前缺失）。
 */
export interface CacheChurnChange {
  readonly blockName: string;
  readonly cacheScope: CacheScope;
  readonly beforeHash?: string;
  readonly afterHash?: string;
}

/** 桩2 在 churn 事件中使用的固定块名与 scope。 */
const TOOLS_BLOCK_NAME = 'tools';
const TOOLS_CACHE_SCOPE: CacheScope = 'global';

/**
 * 比对上一 turn 的静态前缀快照与当前 PromptPlan + tools，产出所有变化。
 *
 * 仅对当前 plan 中存在的块逐块比对（beforeHash 来自上一 turn 同名块）；当前缺失的块
 * 不单独上报（删除块对前缀稳定性的信号弱，且块名通常按位置稳定）。桩2 toolsHash 单独
 * 比对。`previous === undefined` 时（首 turn / restore 后首个 live turn）返回空数组——
 * 调用方据此建立基线、不报 churn。
 */
export function diffStaticPrefix(
  previous: StaticPrefixSnapshot | undefined,
  currentPlan: PromptPlan,
  currentBlockHashes: Record<string, string>,
  currentToolsHash: string,
): CacheChurnChange[] {
  if (previous === undefined) return [];

  const changes: CacheChurnChange[] = [];

  // 桩1：逐块比对（scope 取当前块）。
  for (const block of currentPlan.blocks) {
    const afterHash = currentBlockHashes[block.name];
    const beforeHash = previous.blocks[block.name];
    if (beforeHash !== afterHash) {
      changes.push({
        blockName: block.name,
        cacheScope: block.cacheScope,
        ...(beforeHash !== undefined ? { beforeHash } : {}),
        ...(afterHash !== undefined ? { afterHash } : {}),
      });
    }
  }

  // 桩2：tools 聚合哈希比对（toolsHash 恒为非空 SHA256，before/after 总存在）。
  if (previous.toolsHash !== currentToolsHash) {
    changes.push({
      blockName: TOOLS_BLOCK_NAME,
      cacheScope: TOOLS_CACHE_SCOPE,
      beforeHash: previous.toolsHash,
      afterHash: currentToolsHash,
    });
  }

  return changes;
}
