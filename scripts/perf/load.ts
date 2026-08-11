#!/usr/bin/env bun
/**
 * 引擎性能剖析负载脚本 (PRD-0026)。
 *
 * 三种负载模式:
 *   a — 交互长会话(主场景):多 turn、每 turn 多 step 多工具、大输出
 *   b — resume 大会话:先跑长会话产出 wire,再 resume 全量 replay 测恢复峰值
 *   c — 多 subagent 并行:脚本内并行 spawn N 个子 agent,放大并发分配与内存峰值
 *
 * 注入模式(代码已核验 2026-08-11):绕过 CLI/TUI,进程内直接构造 `Agent`,
 * 在 `AgentConfig.generate` 注入点回放脚本化 part 流(回放 Provider),
 * provider 对象由 `createProvider(dummyByfConfig)` 构造以保证凭证/能力字段真实。
 * 复用 `packages/agent-core/test/agent/harness/` 的注入模式,但不 import 测试内部设施。
 *
 * 用法:
 *   bun scripts/perf/load.ts --mode a                     # 模式 A,默认基线
 *   bun scripts/perf/load.ts --mode a --scale 2           # 2x 压力档
 *   bun --cpu-prof --cpu-prof-md --cpu-prof-interval=1000 scripts/perf/load.ts --mode a
 *   bun --expose-gc scripts/perf/load.ts --mode a         # GC 插桩采样(turn 边界)
 *
 * 规模参数:--turns N --steps "3-5" --tools N --output-kb N --tool-result-kb N
 *          --subagents N --child-turns N --seed N --gc-interval-ms N
 * 输出:--json 输出机器可读摘要(含内存采样),默认人类可读摘要。
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Agent, type AgentConfig, type AgentType } from '../../packages/agent-core/src/agent';
import {
  FileSystemAgentRecordPersistence,
  InMemoryAgentRecordPersistence,
  type AgentRecordPersistence,
} from '../../packages/agent-core/src/agent/records';
import type { ByfConfig } from '../../packages/agent-core/src/config';
import { ProviderManager } from '../../packages/agent-core/src/providers/provider-manager';
import type {
  ApprovalResponse,
  QuestionResult,
  SDKAgentRPC,
  ToolCallRequest,
  ToolCallResponse,
} from '../../packages/agent-core/src/rpc/sdk-api';
import type { Environment } from '../../packages/agent-core/src/utils/environment';
import { estimateTokensForMessages } from '../../packages/agent-core/src/utils/tokens';
import { localKaos } from '../../packages/kaos/src/index';
import {
  isContentPart,
  isToolCall,
  type Message,
  type StreamedMessagePart,
} from '../../packages/kosong/src/index';

type GenerateFn = NonNullable<AgentConfig['generate']>;

const TEST_OS_ENV: Environment = {
  osKind: 'darwin',
  osArch: 'arm64',
  osVersion: 'perf',
  shellName: 'zsh',
  shellPath: '/bin/zsh',
};

const MOCK_MODEL_ALIAS = 'mock-model';
const SYSTEM_PROMPT =
  'You are a performance-test agent. Follow the workload script exactly. ' +
  'Answer concisely and call tools as instructed.';

const FILLER = 'The quick brown fox jumps over the lazy dog and inspects the cache line. ';
const PROMPT_FILLER =
  'Please continue the project work described above, verify the current state, ' +
  'and report the outcome to the user in a short summary. ';

function fill(count: number): string {
  return FILLER.repeat(Math.ceil(count / FILLER.length)).slice(0, count);
}

function fillPrompt(count: number): string {
  return PROMPT_FILLER.repeat(Math.ceil(count / PROMPT_FILLER.length)).slice(0, count);
}

// 确定性伪随机:保证同 seed 同负载,profile 可重复。
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

interface CliOptions {
  readonly mode: 'a' | 'b' | 'c';
  readonly turns: number;
  readonly stepsMin: number;
  readonly stepsMax: number;
  readonly toolsPerStep: number;
  readonly outputChars: number;
  readonly toolResultChars: number;
  readonly promptChars: number;
  readonly subagents: number;
  readonly childTurns: number;
  readonly seed: number;
  readonly gcIntervalMs: number;
  readonly json: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = {
    mode: 'a',
    turns: 50,
    stepsMin: 3,
    stepsMax: 5,
    toolsPerStep: 2,
    outputChars: 15_000,
    toolResultChars: 20_000,
    promptChars: 2_000,
    subagents: 5,
    childTurns: 4,
    seed: 42,
    gcIntervalMs: 500,
    json: false,
  };
  let scale = 1;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = (): string => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`Missing value for ${arg}`);
      return value;
    };
    switch (arg) {
      case '--mode':
        opts.mode = next() as CliOptions['mode'];
        break;
      case '--turns':
        opts.turns = Number(next());
        break;
      case '--steps': {
        const range = next();
        const [min, max] = range.split('-').map(Number);
        if (min === undefined || max === undefined || min < 1 || max < min) {
          throw new Error(`Invalid --steps range (expect "min-max", min>=1, max>=min): ${range}`);
        }
        opts.stepsMin = min;
        opts.stepsMax = max;
        break;
      }
      case '--tools':
        opts.toolsPerStep = Number(next());
        break;
      case '--output-kb':
        opts.outputChars = Number(next()) * 1024;
        break;
      case '--tool-result-kb':
        opts.toolResultChars = Number(next()) * 1024;
        break;
      case '--prompt-kb':
        opts.promptChars = Number(next()) * 1024;
        break;
      case '--subagents':
        opts.subagents = Number(next());
        break;
      case '--child-turns':
        opts.childTurns = Number(next());
        break;
      case '--seed':
        opts.seed = Number(next());
        break;
      case '--gc-interval-ms':
        opts.gcIntervalMs = Number(next());
        break;
      case '--scale':
        scale = Number(next());
        break;
      case '--json':
        opts.json = true;
        break;
      case '--help':
        console.log(
          [
            'Usage: bun scripts/perf/load.ts [options]',
            '  --mode a|b|c            负载模式(默认 a)',
            '  --turns N               turn 数(默认 50)',
            '  --steps "3-5"           每 turn step 数范围(默认 3-5)',
            '  --tools N               每 step 工具调用数(默认 2)',
            '  --output-kb N           每 turn 最终输出 KB(默认 15)',
            '  --tool-result-kb N      每次工具结果 KB(默认 20,低于 offload 阈值)',
            '  --prompt-kb N           每 turn 用户输入 KB(默认 2)',
            '  --subagents N           模式 C 并行子 agent 数(默认 5)',
            '  --child-turns N         模式 C 子 agent turn 数(默认 4)',
            '  --seed N                确定性随机种子(默认 42)',
            '  --gc-interval-ms N      定时 gc() 采样间隔(默认 500)',
            '  --scale 1|2             压力档:2 使 turns/output/tool-result 翻倍',
            '  --json                  输出机器可读 JSON 摘要',
          ].join('\n'),
        );
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (scale === 2) {
    opts.turns *= 2;
    opts.outputChars *= 2;
    opts.toolResultChars *= 2;
    opts.childTurns *= 2;
  }
  if (!['a', 'b', 'c'].includes(opts.mode)) {
    throw new Error(`--mode must be a|b|c, got "${opts.mode}"`);
  }
  return opts;
}

// ─── mock 基建 ───────────────────────────────────────────────────────────────

function buildByfConfig(): ByfConfig {
  // dummy provider:apiKey 非空是凭证校验的硬要求(runtime-provider.ts:100-110);
  // 模型别名解析需要 providers + models 两处都登记。
  return {
    providers: {
      'perf-provider': {
        type: 'openai-completions',
        apiKey: 'test-key',
        model: MOCK_MODEL_ALIAS,
      },
    },
    models: {
      [MOCK_MODEL_ALIAS]: {
        provider: 'perf-provider',
        model: MOCK_MODEL_ALIAS,
        maxContextSize: 1_000_000,
        capabilities: [],
      },
    },
  };
}

const providerManager = new ProviderManager({ config: buildByfConfig() });

function createStubRpc(toolResultChars: number): SDKAgentRPC {
  // 工具结果直接由 stub 返回大块文本,压测 WAL 序列化与投影深拷贝热点。
  const toolCall = async (_request: ToolCallRequest): Promise<ToolCallResponse> => ({
    output: fill(toolResultChars),
    isError: false,
  });
  const requestApproval = async (): Promise<ApprovalResponse> => ({
    decision: 'approved',
    selectedLabel: 'approve',
  });
  const requestQuestion = async (): Promise<QuestionResult> => null;
  const emitEvent = (): void => {};
  return { emitEvent, requestApproval, requestQuestion, toolCall };
}

// perf_fetch:零依赖的用户工具,返回大输出由 stub rpc 提供。绕开真实文件/进程 I/O,
// 把测量焦点锁在引擎热点(投影/缓存staking/token估算/fingerprint/事件风暴)。
const PERF_TOOL = {
  name: 'perf_fetch',
  description: 'Fetch a block of project data for the ongoing task.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      size: { type: 'integer' },
    },
    required: ['query'],
  },
} as const;

interface CreateAgentOptions {
  readonly type?: AgentType;
  readonly persistence: AgentRecordPersistence;
  readonly generate: GenerateFn;
  readonly homedir?: string;
  readonly sessionId?: string;
  readonly toolResultChars: number;
}

function createPerfAgent(options: CreateAgentOptions): Agent {
  const agent = new Agent({
    runtime: { kaos: localKaos, osEnv: TEST_OS_ENV },
    rpc: createStubRpc(options.toolResultChars),
    persistence: options.persistence,
    generate: options.generate,
    providerManager,
    type: options.type,
    homedir: options.homedir,
    sessionId: options.sessionId,
  });
  agent.config.update({
    cwd: process.cwd(),
    modelAlias: MOCK_MODEL_ALIAS,
    systemPrompt: SYSTEM_PROMPT,
    thinkingLevel: 'off',
  });
  agent.tools.registerUserTool(PERF_TOOL);
  return agent;
}

async function runTurns(
  agent: Agent,
  turns: number,
  promptChars: number,
  seed: number,
  sampler: { readonly sampleOnce: () => void },
): Promise<void> {
  for (let i = 0; i < turns; i++) {
    const text = `User turn #${i + 1}: ${fillPrompt(promptChars)}`;
    agent.rpcMethods.prompt({ input: [{ type: 'text', text }] });
    await agent.turn.waitForCurrentTurn();
    // turn 边界是 await 之后的同步安全点:在此确定性采样 GC/内存,不受同步热点饿死。
    sampler.sampleOnce();
  }
}

// ─── 回放 Provider (脚本化生成器) ────────────────────────────────────────────

interface GeneratorPlan {
  /** 每 turn 的 step 数(确定性伪随机,范围 [stepsMin, stepsMax])。 */
  readonly stepsMin: number;
  readonly stepsMax: number;
  readonly toolsPerStep: number;
  /** 每 turn 最后一个 step 的文本输出字符数(流式分块产出)。 */
  readonly outputChars: number;
  readonly seed: number;
}

const TEXT_CHUNK_CHARS = 60;

/**
 * 回放 Provider:在 `AgentConfig.generate` 注入点回放脚本化 part 流。
 *
 * 每 turn 节奏:前几个 step 发 `perf_fetch` 工具调用,最后一个 step 输出大文本
 * (分块流式,复现流式事件风暴热点)。turn/step 状态由调用次数推演,与引擎 loop
 * 的 step 计数对齐(每 step 恰好一次 generate 调用)。
 */
class PerfGenerator {
  private callIndex = 0;
  private turnIndex = 0;
  private stepIndex = 0;
  private stepsInTurn: number;

  constructor(private readonly plan: GeneratorPlan) {
    this.stepsInTurn = this.stepsForTurn(0);
  }

  get callCount(): number {
    return this.callIndex;
  }

  private stepsForTurn(turn: number): number {
    const rand = mulberry32(this.plan.seed ^ (turn * 0x9e3779b9));
    const span = this.plan.stepsMax - this.plan.stepsMin + 1;
    return this.plan.stepsMin + Math.floor(rand() * span);
  }

  private readonly generate: GenerateFn = async (
    _chat,
    _systemPrompt,
    _tools,
    history,
    callbacks,
    options,
  ) => {
    options?.signal?.throwIfAborted();
    const call = this.callIndex;
    const parts: StreamedMessagePart[] = [];
    const isLastStepOfTurn = this.stepIndex >= this.stepsInTurn - 1;

    if (isLastStepOfTurn) {
      // 每 turn 最后一个 step:大文本输出,分块流式(复现流式事件风暴)
      const chunkCount = Math.ceil(this.plan.outputChars / TEXT_CHUNK_CHARS);
      for (let i = 0; i < chunkCount; i++) {
        parts.push({ type: 'text', text: fill(TEXT_CHUNK_CHARS) });
      }
    } else {
      // 中间 step:工具调用(大工具输出由 rpc stub 返回)
      for (let i = 0; i < this.plan.toolsPerStep; i++) {
        parts.push({
          type: 'function',
          id: `perf-call-${call}-${i}`,
          name: 'perf_fetch',
          arguments: JSON.stringify({ query: `query-${call}-${i}`, size: 128 }),
        });
      }
    }

    for (const part of parts) {
      await callbacks?.onMessagePart?.(structuredClone(part));
      options?.signal?.throwIfAborted();
    }

    const content = parts.filter(isContentPart).map((part) => structuredClone(part));
    const toolCalls = parts.filter(isToolCall).map((part) => structuredClone(part));
    const message: Message = {
      role: 'assistant',
      content,
      toolCalls,
    };
    const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'completed';

    // 推进 turn/step 状态
    this.callIndex += 1;
    this.stepIndex += 1;
    if (this.stepIndex >= this.stepsInTurn) {
      this.turnIndex += 1;
      this.stepIndex = 0;
      this.stepsInTurn = this.stepsForTurn(this.turnIndex);
    }

    return {
      id: `perf-${call}`,
      message,
      usage: {
        inputOther: estimateTokensForMessages(history),
        output: estimateTokensForMessages([message]),
        inputCacheRead: 0,
        inputCacheCreation: 0,
      },
      finishReason,
      rawFinishReason: finishReason === 'completed' ? 'stop' : finishReason,
    };
  };

  get generateFn(): GenerateFn {
    return this.generate;
  }
}

// ─── 指标探针 ─────────────────────────────────────────────────────────────────

interface GcStats {
  readonly samples: number;
  readonly ms: number;
}

interface GcProbe {
  /** 确定性采样:在 turn 边界(await 点)调用 gc() 并累计耗时,不受同步热点饿死。 */
  readonly sampleOnce: () => void;
  readonly stop: () => GcStats;
  readonly running: boolean;
}

function installGcProbe(intervalMs: number): GcProbe {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== 'function') {
    return { sampleOnce: () => {}, stop: () => ({ samples: 0, ms: 0 }), running: false };
  }
  let ms = 0;
  let samples = 0;
  const sampleOnce = (): void => {
    const t0 = performance.now();
    gc();
    ms += performance.now() - t0;
    samples += 1;
  };
  // 定时器作为补充:仅在事件循环空闲时触发。CPU 密集的同步运行会饿死 setInterval,
  // 所以样本偏少——真正的 GC 时间占比以 CPU profile 的 GC 帧为准(R3 三管齐下的主路径)。
  const timer = setInterval(sampleOnce, intervalMs);
  return {
    sampleOnce,
    running: true,
    stop: () => {
      clearInterval(timer);
      return { samples, ms };
    },
  };
}

interface MemorySample {
  readonly atMs: number;
  readonly rss: number;
  readonly heapUsed: number;
  readonly external: number;
}

interface MemorySummary {
  readonly peakRss: number;
  readonly peakHeap: number;
  readonly startHeap: number;
  readonly endHeap: number;
}

function installMemoryProbe(): {
  readonly sampleOnce: () => void;
  readonly stop: () => { readonly samples: readonly MemorySample[] };
} {
  const samples: MemorySample[] = [];
  const startedAt = performance.now();
  const pushSample = (): void => {
    const mem = process.memoryUsage();
    samples.push({
      atMs: performance.now() - startedAt,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      external: mem.external,
    });
  };
  // 立即采一次,保证即便运行短于采样间隔(200ms)也至少有一个样本。
  pushSample();
  const timer = setInterval(pushSample, 200);
  return {
    // turn 边界采样:与 GC probe 同点,避免 setInterval 被同步热点饿死(见 installGcProbe 注释)。
    sampleOnce: pushSample,
    stop: () => {
      clearInterval(timer);
      // 停止时再采一次,捕获尾部峰值。
      pushSample();
      return { samples };
    },
  };
}

function summarize(samples: readonly MemorySample[]): MemorySummary {
  let peakRss = 0;
  let peakHeap = 0;
  for (const sample of samples) {
    peakRss = Math.max(peakRss, sample.rss);
    peakHeap = Math.max(peakHeap, sample.heapUsed);
  }
  return {
    peakRss,
    peakHeap,
    startHeap: samples[0]?.heapUsed ?? 0,
    endHeap: samples.at(-1)?.heapUsed ?? 0,
  };
}

// ─── 模式执行 ────────────────────────────────────────────────────────────────

interface RunResult {
  readonly mode: string;
  readonly wallMs: number;
  readonly gc: GcStats;
  readonly memory: MemorySummary;
  readonly memorySamples: readonly MemorySample[];
  readonly generateCalls: number;
  readonly records: number;
  readonly wireBytes: number;
  readonly resumeMs?: number;
  readonly resumeError?: string;
  readonly subagentCompletions: number;
}

function buildGenerator(opts: CliOptions, outputCharsOverride?: number): PerfGenerator {
  return new PerfGenerator({
    stepsMin: opts.stepsMin,
    stepsMax: opts.stepsMax,
    toolsPerStep: opts.toolsPerStep,
    outputChars: outputCharsOverride ?? opts.outputChars,
    seed: opts.seed,
  });
}

async function runModeA(
  opts: CliOptions,
  sampler: { readonly sampleOnce: () => void },
): Promise<RunResult> {
  const persistence = new InMemoryAgentRecordPersistence();
  const generator = buildGenerator(opts);
  const agent = createPerfAgent({
    persistence,
    generate: generator.generateFn,
    toolResultChars: opts.toolResultChars,
  });
  const t0 = performance.now();
  await runTurns(agent, opts.turns, opts.promptChars, opts.seed, sampler);
  const wallMs = performance.now() - t0;
  return {
    mode: 'a',
    wallMs,
    gc: { samples: 0, ms: 0 },
    memory: { peakRss: 0, peakHeap: 0, startHeap: 0, endHeap: 0 },
    memorySamples: [],
    generateCalls: generator.callCount,
    records: persistence.records.length,
    wireBytes: 0,
    subagentCompletions: 0,
  };
}

async function runModeB(
  opts: CliOptions,
  sampler: { readonly sampleOnce: () => void },
): Promise<RunResult> {
  const home = await mkdtemp(join(tmpdir(), 'byf-perf-'));
  const wirePath = join(home, 'wire.jsonl');
  const persistence = new FileSystemAgentRecordPersistence(wirePath, {
    onError: (error) => console.error('[perf] wire write error:', error),
  });
  try {
    const generator = buildGenerator(opts);
    const agent = createPerfAgent({
      persistence,
      generate: generator.generateFn,
      homedir: home,
      sessionId: 'perf-session',
      toolResultChars: opts.toolResultChars,
    });
    const t0 = performance.now();
    await runTurns(agent, opts.turns, opts.promptChars, opts.seed, sampler);
    const sessionMs = performance.now() - t0;
    await persistence.flush();

    const wireBytes = (await stat(wirePath)).size;

    // resume 全量 replay:replay 不应调用 LLM(records.replay 只重建状态,不重放 turn)。
    const failGenerate: GenerateFn = async () => {
      throw new Error('resume replay unexpectedly called generate');
    };
    const resumed = createPerfAgent({
      persistence,
      generate: failGenerate,
      homedir: home,
      sessionId: 'perf-session',
      toolResultChars: opts.toolResultChars,
    });
    const t1 = performance.now();
    const resumeResult = await resumed.resume();
    const resumeMs = performance.now() - t1;

    return {
      mode: 'b',
      wallMs: sessionMs,
      gc: { samples: 0, ms: 0 },
      memory: { peakRss: 0, peakHeap: 0, startHeap: 0, endHeap: 0 },
      memorySamples: [],
      generateCalls: generator.callCount,
      records: -1,
      wireBytes,
      resumeMs,
      resumeError: resumeResult.error?.message,
      subagentCompletions: 0,
    };
  } finally {
    // finally 保证即便 runTurns/resume/stat 抛错也清理临时 homedir,不泄漏到 $TMPDIR。
    // 先关持久化句柄再删目录,避免 rm 撞上未刷新的文件句柄。
    await persistence.close().catch(() => {});
    await rm(home, { recursive: true, force: true });
  }
}

async function runModeC(
  opts: CliOptions,
  sampler: { readonly sampleOnce: () => void },
): Promise<RunResult> {
  // 模式 C:脚本内并行 spawn N 个子 agent,各自跑独立长会话。
  // 不走 Agent 工具的 background 路径——那是 Session 级设施,涉及后台任务完成注入、
  // Task* 工具激活、turn/step 计数与 loop 重对齐等复杂语义,对基准脚本过重且脆弱。
  // 直接 Promise.all 驱动 N 个进程内子 agent,同样放大并发分配与内存峰值(本模式目标),
  // 同时保留脚本的可重复性与确定性。
  const childCount = Math.max(1, opts.subagents);
  const persistence = new InMemoryAgentRecordPersistence();
  const childGenerators: PerfGenerator[] = [];

  const spawnChild = (index: number): Promise<void> => {
    const childGenerator = buildGenerator(opts, Math.floor(opts.outputChars / 4));
    childGenerators.push(childGenerator);
    const child = createPerfAgent({
      type: 'sub',
      persistence,
      generate: childGenerator.generateFn,
      toolResultChars: opts.toolResultChars,
    });
    // 各子 agent 用不同 seed,保证负载形态有差异(模拟真实多任务),但仍可复现。
    return runTurns(child, opts.childTurns, opts.promptChars, opts.seed + index * 7919, {
      // 子 agent 并发跑,共享主 agent 的 gc probe 会竞争;子 agent 的 GC 贡献
      // 由 CPU profile 的 GC 帧统一归属(R3 主路径),这里用 noop 探针。
      sampleOnce: () => {},
    });
  };

  const t0 = performance.now();
  await Promise.all(Array.from({ length: childCount }, (_, i) => spawnChild(i)));
  const wallMs = performance.now() - t0;

  const generateCalls = childGenerators.reduce((sum, g) => sum + g.callCount, 0);
  return {
    mode: 'c',
    wallMs,
    gc: { samples: 0, ms: 0 },
    memory: { peakRss: 0, peakHeap: 0, startHeap: 0, endHeap: 0 },
    memorySamples: [],
    generateCalls,
    records: persistence.records.length,
    wireBytes: 0,
    subagentCompletions: childCount,
  };
}

// ─── 主入口 ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const gcProbe = installGcProbe(opts.gcIntervalMs);
  const memoryProbe = installMemoryProbe();

  const t0 = performance.now();
  let result: RunResult;
  // 组合采样器:turn 边界同时采 GC 与内存(子 agent 并发时用 noop,避免竞争)。
  const sampler = {
    sampleOnce: (): void => {
      gcProbe.sampleOnce();
      memoryProbe.sampleOnce();
    },
  };
  switch (opts.mode) {
    case 'a':
      result = await runModeA(opts, sampler);
      break;
    case 'b':
      result = await runModeB(opts, sampler);
      break;
    case 'c':
      result = await runModeC(opts, sampler);
      break;
  }
  const gc = gcProbe.stop();
  const memory = memoryProbe.stop();
  result = {
    ...result,
    wallMs: performance.now() - t0,
    gc,
    memory: summarize(memory.samples),
    memorySamples: memory.samples,
  };

  if (opts.json) {
    console.log(
      JSON.stringify({
        mode: result.mode,
        wallMs: result.wallMs,
        gc: {
          samples: result.gc.samples,
          ms: result.gc.ms,
          pct: result.wallMs > 0 ? (result.gc.ms / result.wallMs) * 100 : 0,
        },
        memory: result.memory,
        memorySamples: result.memorySamples,
        generateCalls: result.generateCalls,
        records: result.records,
        wireBytes: result.wireBytes,
        resumeMs: result.resumeMs,
        resumeError: result.resumeError,
        subagentCompletions: result.subagentCompletions,
        options: { ...opts },
      }),
    );
    return;
  }

  console.log(
    `mode ${result.mode} turns=${opts.turns} steps=${opts.stepsMin}-${opts.stepsMax} ` +
      `tools=${opts.toolsPerStep} output=${Math.round(opts.outputChars / 1024)}KB ` +
      `toolResult=${Math.round(opts.toolResultChars / 1024)}KB`,
  );
  console.log(`  wall: ${Math.round(result.wallMs)}ms`);
  if (gcProbe.running) {
    console.log(
      `  gc:   ${result.gc.samples} samples / ${Math.round(result.gc.ms)}ms ` +
        `(${result.wallMs > 0 ? ((result.gc.ms / result.wallMs) * 100).toFixed(1) : '0.0'}%)`,
    );
  } else {
    console.log('  gc:   not instrumented (run with --expose-gc to sample forced GC)');
  }
  console.log(
    `  mem:  peakRss=${formatBytes(result.memory.peakRss)} peakHeap=${formatBytes(result.memory.peakHeap)} ` +
      `heap ${formatBytes(result.memory.startHeap)} → ${formatBytes(result.memory.endHeap)}`,
  );
  console.log(
    `  records: ${result.records >= 0 ? result.records : 'n/a'}  wire: ${formatBytes(result.wireBytes)}`,
  );
  if (result.resumeMs !== undefined) {
    console.log(
      `  resume: ${Math.round(result.resumeMs)}ms${result.resumeError ? ` (error: ${result.resumeError})` : ''}`,
    );
  }
  if (result.subagentCompletions > 0) {
    console.log(`  subagents: ${result.subagentCompletions}`);
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

void main()
  .then(() => {
    // 子 agent(模式 C)的后台任务管理器会留下短暂 grace timer(Bash 后台进程的
    // 回收定时器等),可能让事件循环保持活跃、阻止进程自然退出。基准脚本结果已完全
    // 打印,显式退出避免空挂。
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      '[perf] load script failed:',
      error instanceof Error ? (error.stack ?? error.message) : error,
    );
    process.exit(1);
  });
