import type { HookEngine as HookEngineType } from '../agent/hooks/engine';
import type { V2HookRegistry } from './hooks';

/**
 * shell hooks 13 事件 → v2 hook 目录映射桥（PRD-0037 #333）。
 *
 * 既有用户 hook 配置（config.hooks，HookDefSchema）在新引擎行为等价：
 * PreToolUse→before_tool（block：exit code 2 / JSON deny）、PostToolUse/
 * PostToolUseFailure→after_tool、UserPromptSubmit→before_run（stdout 注入
 * persisted）、Stop/StopFailure→before_run_end（Stop block → followUp 一次
 * 续跑）、PreCompact→before_compaction、PostCompact→压缩结束事件、
 * SessionStart/SessionEnd→harness create/close、SubagentStart/SubagentStop→
 * 子代理工具 before/after、Notification→事件。
 * HookEngine 执行语义保留（Kaos 执行、跟随工作目录、失败隔离）；
 * 映射层对旧配置文件格式零变化。
 */

export interface ShellHookBridgeOptions {
  readonly engine: HookEngineType;
  readonly registry: V2HookRegistry;
}

/** 把旧 HookEngine 桥接进 v2 hooks 注册表。 */
export function bridgeShellHooks(options: ShellHookBridgeOptions): void {
  const { engine, registry } = options;

  registry.register('before_run', async (input) => {
    if (input.hookPoint !== 'before_run') return undefined;
    const promptText = input.input
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    const results = await engine.trigger('UserPromptSubmit', {
      matcherValue: promptText,
      inputData: { prompt: promptText },
    });
    const block = results.find((result) => result.action === 'block');
    if (block) {
      return { block: true, reason: block.reason ?? 'UserPromptSubmit hook blocked' };
    }
    const injected = results
      .map((result) => result.stdout)
      .filter((stdout): stdout is string => stdout !== undefined && stdout.length > 0)
      .join('\n');
    return injected.length > 0 ? { persisted: { injected } } : undefined;
  });

  registry.register('before_tool', async (input) => {
    if (input.hookPoint !== 'before_tool') return undefined;
    const decision = await engine.triggerBlock('PreToolUse', {
      matcherValue: input.name,
      inputData: { tool_name: input.name, tool_input: input.args },
    });
    if (decision !== undefined) {
      return { block: true, reason: decision.reason };
    }
    return undefined;
  });

  registry.register('after_tool', async (input) => {
    if (input.hookPoint !== 'after_tool') return undefined;
    await engine.fireAndForgetTrigger(input.isError ? 'PostToolUseFailure' : 'PostToolUse', {
      matcherValue: input.name,
      inputData: { tool_name: input.name, tool_call_id: input.toolCallId },
    });
    return undefined;
  });

  registry.register('before_run_end', async (input) => {
    if (input.hookPoint !== 'before_run_end') return undefined;
    if (input.outcome === 'completed') {
      const decision = await engine.triggerBlock('Stop', {});
      if (decision !== undefined) {
        return { followUp: true }; // Stop block → 一次续跑（旧引擎语义）
      }
    } else {
      await engine.fireAndForgetTrigger('StopFailure', {});
    }
    return undefined;
  });

  registry.register('before_compaction', async (input) => {
    if (input.hookPoint !== 'before_compaction') return undefined;
    await engine.trigger('PreCompact', {});
    return undefined;
  });
}

/** SessionStart/SessionEnd：harness 生命周期（装配层直接调 engine）。 */
export async function fireSessionStart(
  engine: HookEngineType,
  source: 'startup' | 'resume',
): Promise<void> {
  await engine.trigger('SessionStart', { inputData: { source } });
}

export async function fireSessionEnd(engine: HookEngineType): Promise<void> {
  await engine.trigger('SessionEnd', { inputData: { reason: 'exit' } });
}

/** PostCompact：压缩结束事件。 */
export async function firePostCompact(engine: HookEngineType): Promise<void> {
  await engine.fireAndForgetTrigger('PostCompact', {});
}

/** Notification：事件通道（不经 hook 阻断）。 */
export async function fireNotification(engine: HookEngineType, message: string): Promise<void> {
  await engine.fireAndForgetTrigger('Notification', { inputData: { message } });
}

/** SubagentStart/SubagentStop：子代理工具的 before/after（fork 模型）。 */
export async function fireSubagentStart(engine: HookEngineType, profile: string): Promise<void> {
  await engine.trigger('SubagentStart', { inputData: { profile } });
}

export async function fireSubagentStop(engine: HookEngineType, profile: string): Promise<void> {
  await engine.fireAndForgetTrigger('SubagentStop', { inputData: { profile } });
}
