import { createHash } from 'node:crypto';

import { AgentHarness } from './agent-harness';
import type { AgentHarnessConfig } from './agent-harness';
import { WireSession } from './session/session';
import { InMemorySessionStorage } from './storage/memory';
import type { SessionStorage } from './storage/storage';

export { synthesizeOrphanToolResults } from './transcript';

/**
 * fork 与子代理（PRD-0037 #330，v2 §16）。
 *
 * - fork = entries-only 复制（branch scope）：目标天生 idle（无 records/队列）、
 *   name 总是复制、label 仅目标 entry 被复制时随行（此处按 fact 语义：目标
 *   leaf 链上存在 label fact 才复制）、parentSessionId 链接写入目标 facts；
 * - 子会话 id 确定性派生 f(parentSessionId, toolCallId)——safe replay 重放
 *   tool_started 时重挂接同一子会话，不产生双胞胎；
 * - tip 位于工具批中途的 fork：孤儿 tool call 由 synthesizeOrphanToolResults
 *   在请求投影层合成空结果（会话所存不改）。
 */

/** 确定性子会话 id：同一 (parent, toolCall) 永远派生同一 id。 */
export function deriveChildSessionId(parentSessionId: string, toolCallId: string): string {
  const digest = createHash('sha256').update(`${parentSessionId}\u0000${toolCallId}`).digest('hex');
  return `sub-${digest.slice(0, 24)}`;
}

export interface ForkSessionOptions {
  /** fork 点（缺省 = main lane leaf）；运行中源会话读 committed prefix。 */
  readonly entryId?: string;
  /** 目标存储工厂（缺省内存后端）。 */
  readonly createTargetStorage?: (sessionId: string) => Promise<SessionStorage> | SessionStorage;
  /** 显式目标会话 id（子代理确定性派生路径使用）。 */
  readonly targetSessionId?: string;
}

/** fork 结果：目标会话 + 链接信息。 */
export interface ForkResult {
  readonly session: WireSession;
  readonly sessionId: string;
  /** 从源复制的 entry 数。 */
  readonly copiedEntries: number;
}

/** repo 级 fork：entries-only 复制 + parent 链接 facts。 */
export async function forkSession(
  source: AgentHarness,
  options: ForkSessionOptions = {},
): Promise<ForkResult> {
  const targetSessionId =
    options.targetSessionId ??
    `fork-${createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 12)}`;
  const storage =
    options.createTargetStorage?.(targetSessionId) ?? new InMemorySessionStorage(targetSessionId);
  const target = await WireSession.create(await Promise.resolve(storage));
  await source.session.forkTo(target, options.entryId ? { fromEntryId: options.entryId } : {});
  const copied = (await target.branch({ direction: 'oldestFirst' })).entries.length;
  // parent 链接 + name 复制（facts）
  await target.setFact({
    name: 'parentSession',
    value: {
      sessionId: source.session.sessionId,
      ...(options.entryId ? { entryId: options.entryId } : {}),
    },
  });
  const sourceTitle = (await source.session.facts()).get('title');
  if (sourceTitle) {
    await target.setFact({ name: 'title', value: sourceTitle.value });
  }
  return { session: target, sessionId: targetSessionId, copiedEntries: copied };
}

/**
 * 子代理 spawn（fork 模型）：确定性子会话 id + 独立运行 + 结果回填。
 * 权限/模型继承语义由 config 透传（resolveLLM/tools 沿用父 harness 装配）。
 */
export class HarnessSubagentSpawner {
  constructor(
    private readonly parent: AgentHarness,
    private readonly config: Omit<AgentHarnessConfig, 'storage'> = {},
    private readonly createTargetStorage?: (
      sessionId: string,
    ) => Promise<SessionStorage> | SessionStorage,
  ) {}

  /** spawn 即 fork：同一 toolCallId 重放（safe replay）重挂接同一子会话。 */
  async spawn(
    toolCallId: string,
    prompt: readonly { type: 'text'; text: string }[],
  ): Promise<{ sessionId: string; output: string; outcome: string }> {
    const sessionId = deriveChildSessionId(this.parent.session.sessionId, toolCallId);
    const forked = await forkSession(this.parent, {
      targetSessionId: sessionId,
      ...(this.createTargetStorage ? { createTargetStorage: this.createTargetStorage } : {}),
    });
    const child = await AgentHarness.create({ ...this.config, storage: forked.session.storageRef });
    try {
      const result = await child.lane().prompt(prompt, {
        origin: { kind: 'system_trigger', name: 'subagent' },
      });
      if (!result.ok) {
        return { sessionId, output: `subagent failed: ${result.code}`, outcome: 'failed' };
      }
      // 结果回填：最后一条 assistant 文本
      const branch = await child.session.branch({});
      const lastAssistant = [...branch.entries]
        .toReversed()
        .find((e) => e.kind === 'message' && e.message.role === 'assistant');
      const output =
        lastAssistant && lastAssistant.kind === 'message'
          ? lastAssistant.message.content
              .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
              .map((p) => p.text)
              .join('')
          : '';
      return { sessionId, output, outcome: result.value.outcome };
    } finally {
      await child.close();
    }
  }
}
