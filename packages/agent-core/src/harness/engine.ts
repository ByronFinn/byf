import { createProvider } from '@byfriends/kosong';

import { KosongLLM } from '../agent/turn/kosong-llm';
import type { LLM } from '../loop/llm';
import type { ExecutableTool } from '../loop/types';
import type { ProviderManager } from '../providers/provider-manager';
import { AgentHarness } from './agent-harness';
import type { AgentHarnessConfig } from './agent-harness';
import type { SessionStorage } from './storage/storage';

/**
 * v2 引擎装配工厂（PRD-0037 #327，ADR-0041 实验开关的 dogfood 入口）。
 *
 * 把 ProviderManager 解析出的 provider/model 桥接为 loop LLM 契约
 * （KosongLLM），构造 AgentHarness。装配层（node-sdk/core-impl）在
 * engine = 'v2' 时为新会话调用本工厂；legacy 路径零变化。
 * 现状（#339 停损）：config.engine 已解析但装配层尚未接线——设置
 * engine = 'v2' 暂不会改变默认路径，待 host 面（MCP/skills/cron/后台/审批）
 * 移植进 v2 装配后生效。
 */

export type SessionEngine = 'legacy' | 'v2';

/** 从配置解析引擎选择（缺省 legacy——现网行为零变化）。 */
export function resolveSessionEngine(config: { readonly engine?: string }): SessionEngine {
  return config.engine === 'v2' ? 'v2' : 'legacy';
}

export class EngineFormatMismatchError extends Error {
  constructor(
    readonly engine: SessionEngine,
    readonly sessionFormat: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = 'EngineFormatMismatchError';
  }
}

/**
 * 引擎 ↔ 会话格式路由守卫：
 * - 2.0 会话只能由 v2 引擎打开；
 * - v2 引擎不打开 1.1 会话（提示用 legacy 或升级会话不可用）。
 * 旧引擎打开 2.0 会话同样明确报错。
 */
export function assertEngineFormatCompatible(
  engine: SessionEngine,
  sessionFormat: string | undefined,
): void {
  if (sessionFormat === '2.0' && engine !== 'v2') {
    throw new EngineFormatMismatchError(
      engine,
      sessionFormat,
      `该会话为 wire 2.0 格式，当前引擎（${engine}）无法打开；请使用 engine = "v2"。`,
    );
  }
  if (sessionFormat === '1.1' && engine === 'v2') {
    throw new EngineFormatMismatchError(
      engine,
      sessionFormat,
      '该会话来自旧版本 byf（wire 1.1 格式），v2 引擎不支持打开；旧会话已从列表隐藏，文件保留。',
    );
  }
}

export interface V2EngineHarnessInput {
  readonly providerManager: ProviderManager;
  readonly modelAlias?: string;
  readonly systemPrompt: string;
  readonly storage: SessionStorage;
  readonly tools?: readonly ExecutableTool[];
  /** LLM 覆盖（测试注入脚本化驱动）；缺省从 ProviderManager 构造 KosongLLM。 */
  readonly llm?: LLM;
  readonly maxSteps?: number;
  readonly maxRetryAttempts?: number;
  readonly maxResumeAttempts?: number;
  readonly toolReplaySafety?: AgentHarnessConfig['toolReplaySafety'];
  readonly onEvent?: AgentHarnessConfig['onEvent'];
}

/**
 * 构造 v2 引擎 AgentHarness：解析 provider/model/capability，桥接 KosongLLM。
 * 存储注入（典型为会话目录上的 JsonlSessionStorage）。
 */
export async function createV2EngineHarness(input: V2EngineHarnessInput): Promise<AgentHarness> {
  let llm = input.llm;
  if (llm === undefined) {
    const resolved = await input.providerManager.resolveProviderForModel(input.modelAlias);
    if (!resolved) {
      throw new Error(
        `v2 引擎无法解析模型 ${input.modelAlias ?? '(default)'}；请检查 providers 配置。`,
      );
    }
    llm = new KosongLLM({
      provider: createProvider(resolved.provider),
      modelName: resolved.modelName,
      systemPrompt: input.systemPrompt,
      capability: resolved.modelCapabilities,
    });
  }
  return AgentHarness.create({
    storage: input.storage,
    llm,
    ...(input.tools !== undefined ? { tools: input.tools } : {}),
    ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
    ...(input.maxRetryAttempts !== undefined ? { maxRetryAttempts: input.maxRetryAttempts } : {}),
    ...(input.maxResumeAttempts !== undefined
      ? { maxResumeAttempts: input.maxResumeAttempts }
      : {}),
    ...(input.toolReplaySafety !== undefined ? { toolReplaySafety: input.toolReplaySafety } : {}),
    ...(input.onEvent !== undefined ? { onEvent: input.onEvent } : {}),
  });
}
