/**
 * PRD-0038 R3 / AC-3.1 + AC-3.4：会话身份与工具重放安全的 **SDK 契约层定义**。
 *
 * 为什么落在这一层：resume/fork 的身份语义与"事件日志可重放 ≠ 工具副作用可
 * 回滚"属于 harness/SDK 契约，不是终端交互细节（对标结论：该语义出现在
 * SDK/harness 文档层）。CLI、TUI、web、headless 只能经 `@byfriends/sdk` 使用
 * 核心能力（ADR-0006），所以这两条契约必须是本包的公开导出——各表面 import
 * 同一张表、各自断言自己那一行，而不是本地另抄期望。
 *
 * 深冻结纪律：这张表被多个表面当作**期望值**读取。可变的共享期望比没有共享
 * 期望更糟——一个表面就地改表会让另外两个表面的判据静默失效。与 ADR-0032 对
 * reducer 输出的冻结承诺同源。
 */

/** resume / fork 单行的身份语义（取值字面量即契约，跨 4 个消费文件承载）。 */
export interface SessionIdentitySemantics {
  /** resume 保留原 session ID；fork 铸造新 session ID。 */
  readonly sessionId: 'preserve' | 'new';
  /** resume 往既有历史追加；fork 把历史复制进新会话。 */
  readonly history: 'append-to-existing' | 'copy-into-new-session';
  /** resume 下原会话随追加增长；fork 绝不允许改动源会话字节。 */
  readonly sourceSessionBytes: 'may-grow' | 'must-not-change';
  /** 两者都从新上下文窗口开始：由（复制来的）事件日志重建，而非继承内存态。 */
  readonly contextWindow: 'reconstructed-from-event-log';
}

export interface SessionIdentityContract {
  readonly resume: SessionIdentitySemantics;
  readonly fork: SessionIdentitySemantics;
}

function deepFreeze<T>(value: T): T {
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    if (typeof child === 'object' && child !== null) deepFreeze(child);
  }
  return value;
}

/** resume 与 fork 是两种可区分的身份（AC-3.1）；行为侧断言见 ByfHarness resume/fork 测试。 */
export const SESSION_IDENTITY_CONTRACT: SessionIdentityContract = deepFreeze({
  resume: {
    sessionId: 'preserve',
    history: 'append-to-existing',
    sourceSessionBytes: 'may-grow',
    contextWindow: 'reconstructed-from-event-log',
  },
  fork: {
    sessionId: 'new',
    history: 'copy-into-new-session',
    sourceSessionBytes: 'must-not-change',
    contextWindow: 'reconstructed-from-event-log',
  },
});

/**
 * 工具重放安全的三档词汇（AC-3.4，有序）：
 * - `read-only`：幂等只读，restore 可安全重放一次；
 * - `side-effect`：本机副作用，restore 以合成观察收尾（文件可能停在半改动状态，
 *   合成观察 ≠ 回滚）；
 * - `remote-irreversible`：效果可能已经在远端发生且不可撤销，一律合成观察。
 */
export type ToolReplaySafetyClass = 'read-only' | 'side-effect' | 'remote-irreversible';

/** 词汇表（深冻结）。二元 never|safe 分不清"本机可重放"与"远程已不可逆"。 */
export const TOOL_REPLAY_SAFETY_CLASSES: readonly ToolReplaySafetyClass[] = deepFreeze([
  'read-only',
  'side-effect',
  'remote-irreversible',
]);

const READ_ONLY_TOOLS = new Set(['Read', 'Grep', 'Glob']);
const SIDE_EFFECT_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit', 'Bash']);

/**
 * 默认重放安全分类：宿主与 harness 缺省判定的单一真源，不要各自发明。
 * 未登记的工具一律保守归 `side-effect`（宁可少重放，不可重复下单）；MCP 工具
 * 走远端（`mcp__<server>__<tool>`），归 `remote-irreversible`。
 */
export function classifyToolReplaySafety(toolName: string): ToolReplaySafetyClass {
  if (toolName.startsWith('mcp__')) return 'remote-irreversible';
  if (READ_ONLY_TOOLS.has(toolName)) return 'read-only';
  if (SIDE_EFFECT_TOOLS.has(toolName)) return 'side-effect';
  return 'side-effect';
}
