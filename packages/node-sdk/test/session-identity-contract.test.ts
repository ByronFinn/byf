import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * PRD-0038 R3 / AC-3.1 + AC-3.4：会话身份与重放安全边界在 **SDK 契约层**的
 * 单一定义。
 *
 * 为什么落在这一层（对标结论：3-0 共识，"该语义出现在 SDK/harness 文档层而非
 * TUI 层"）：resume/fork 的身份语义、以及"事件日志可重放 ≠ 工具副作用可回滚"，
 * 都属于 harness/SDK 契约，不是终端交互细节。CLI (`apps/cli`)、web
 * (`apps/web/server`)、headless (`byf --print`) 三个表面只能经 `@byfriends/sdk`
 * 使用核心能力（ADR-0006），所以这张表和重放分类必须是本包的公开导出，三表面各自
 * import 同一份再断言自己那一行——见
 * `apps/cli/test/cli/run-prompt.test.ts`（headless）、
 * `apps/cli/test/tui/byf-tui-message-flow.test.ts`（TUI）、
 * `apps/web/server/src/web-server.test.ts`（web）。
 *
 * 行为断言全部走真实临时目录 + 真实会话目录字节。provider 是外部边界，用仓内既有
 * 的 `createProvider` fake 模式（`session-prompt-events.test.ts`）。
 */

const providerState = {
  requests: [] as Array<{ readonly systemPrompt: string; readonly history: unknown[] }>,
};

const __mockActual__kosong = await import('@byfriends/kosong');
vi.mock('@byfriends/kosong', () => {
  const actual = __mockActual__kosong;
  return {
    ...actual,
    createProvider: () => ({
      name: 'fake',
      modelName: 'test-model',
      thinkingEffort: null,
      async generate(systemPrompt: string, _tools: unknown, history: unknown[]) {
        providerState.requests.push({ systemPrompt, history: [...history] });
        return {
          id: 'fake-response',
          usage: { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 },
          finishReason: 'completed',
          rawFinishReason: 'stop',
          async *[Symbol.asyncIterator]() {
            yield { type: 'text', text: 'ok from fake provider' };
          },
        };
      },
      withThinking() {
        return this;
      },
    }),
  };
});

const { ByfHarness } = await import('#/index');
const sdkNamespace = await import('#/index');

const tempDirs: string[] = [];

beforeEach(() => {
  providerState.requests.length = 0;
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function newHarness(homeDir: string): Promise<InstanceType<typeof ByfHarness>> {
  const harness = new ByfHarness({
    homeDir,
    identity: { userAgentProduct: 'byf-test', version: '0.0.0-test' },
  });
  await harness.setConfig({
    providers: { local: { type: 'openai-completions', apiKey: 'sk-test' } },
    models: { 'test-model': { provider: 'local', model: 'test-model', maxContextSize: 262144 } },
    defaultModel: 'test-model',
  });
  return harness;
}

/**
 * 会话目录的完整字节清单（路径 → sha256:字节数），用于"原会话字节不变"。
 * `logs/` 被排除：诊断日志与对话历史无关，它增长不构成身份语义违约。
 */
async function dirManifest(root: string): Promise<string> {
  const entries: string[] = [];
  async function walk(dir: string, relative: string): Promise<void> {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const absolute = join(dir, item.name);
      const path = `${relative}/${item.name}`;
      if (path.startsWith('/logs')) continue;
      if (item.isDirectory()) {
        await walk(absolute, path);
        continue;
      }
      const bytes = await readFile(absolute);
      entries.push(`${path}:${createHash('sha256').update(bytes).digest('hex')}:${bytes.length}`);
    }
  }
  await walk(root, '');
  return entries.toSorted().join('\n');
}

/** 等活跃会话的异步 wire flush 落定后再取清单，避免把自身追加误判成 fork 改写。 */
async function settledManifest(root: string): Promise<string> {
  let previous = await dirManifest(root);
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    const current = await dirManifest(root);
    if (current === previous) return current;
    previous = current;
  }
  return previous;
}

async function readMainWireLines(sessionDir: string): Promise<string[]> {
  const text = await readFile(join(sessionDir, 'agents', 'main', 'wire.jsonl'), 'utf-8');
  return text.split('\n').filter((line) => line.length > 0);
}

/** 所有已发出 provider 请求里的 user 文本（历史是否来自磁盘日志的直接观测）。 */
function providerUserTexts(): string[] {
  const texts: string[] = [];
  for (const request of providerState.requests) {
    for (const raw of request.history) {
      const message = raw as { role?: string; content?: unknown };
      if (message.role !== 'user' || !Array.isArray(message.content)) continue;
      for (const part of message.content) {
        const text = (part as { type?: string; text?: string }).text;
        if (typeof text === 'string') texts.push(text);
      }
    }
  }
  return texts;
}

// ── AC-3.1：契约表 ──────────────────────────────────────────────────────────

interface SessionIdentitySemantics {
  readonly sessionId: 'preserve' | 'new';
  readonly history: 'append-to-existing' | 'copy-into-new-session';
  readonly sourceSessionBytes: 'may-grow' | 'must-not-change';
  readonly contextWindow: 'reconstructed-from-event-log';
}

/** 三表面共同断言的唯一表格——期望值写在这里，不接受实现自拟。 */
const EXPECTED_IDENTITY: Readonly<Record<'resume' | 'fork', SessionIdentitySemantics>> = {
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
};

/**
 * 表格必须是深冻结的。理由：这张表同时被 CLI / web / headless 三个表面 import 来
 * 当作**期望值**（见 apps/cli/test/cli/run-prompt.test.ts 等）。一个可在运行时被改写
 * 的"共享期望"比没有共享期望更糟——某个表面为了让自己那行通过而就地改表，就会让
 * 另外两个表面的测试静默失效。ADR-0032 对 reducer 输出用的是同一条纪律。
 */
function deepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every((child) => deepFrozen(child));
}

describe('PRD-0038 AC-3.1 resume/fork identity contract (SDK layer)', () => {
  it('is defined once on the public SDK surface, covering exactly resume and fork', () => {
    const contract = (
      sdkNamespace as unknown as {
        SESSION_IDENTITY_CONTRACT?: Record<string, SessionIdentitySemantics>;
      }
    ).SESSION_IDENTITY_CONTRACT;

    expect(
      contract,
      '@byfriends/sdk 必须导出 resume/fork 身份语义表（三表面的单一真源）',
    ).toBeDefined();
    expect(Object.keys(contract ?? {}).toSorted()).toEqual(['fork', 'resume']);
    expect(contract).toEqual(EXPECTED_IDENTITY);
    expect(
      deepFrozen(contract),
      '共享期望表必须深冻结，否则任何表面都能就地改掉另外两个表面的判据',
    ).toBe(true);
  });

  it('resume keeps the session id and appends to the existing event log', async () => {
    const homeDir = await makeTempDir('byf-ac31-resume-home-');
    const workDir = await makeTempDir('byf-ac31-resume-work-');

    const first = await newHarness(homeDir);
    const created = await first.createSession({ id: 'ses_ac31_a', workDir });
    const sessionDir = created.summary?.sessionDir;
    expect(sessionDir, '会话目录必须在 summary 上可见').toBeDefined();
    await created.prompt('the first fact');
    await first.close();

    const linesBefore = await readMainWireLines(sessionDir!);
    expect(linesBefore.length).toBeGreaterThan(0);

    // 全新进程替身：一个新的 ByfHarness，不共享任何内存态
    const second = await newHarness(homeDir);
    const resumed = await second.resumeSession({ id: 'ses_ac31_a' });
    expect(resumed.id, 'resume 保留原 session ID').toBe('ses_ac31_a');
    expect(resumed.summary?.sessionDir, 'resume 复用同一会话目录').toBe(sessionDir);

    providerState.requests.length = 0;
    await resumed.prompt('the second fact');
    await second.close();

    const linesAfter = await readMainWireLines(sessionDir!);
    expect(linesAfter.length, 'resume 往既有历史追加').toBeGreaterThan(linesBefore.length);
    expect(linesAfter.slice(0, linesBefore.length), '既有事件不得被改写（append-only）').toEqual(
      linesBefore,
    );

    // 新上下文窗口 = 由事件日志重建，而不是继承上一个 handle 的内存态
    const userTexts = providerUserTexts();
    expect(
      userTexts.some((text) => text.includes('the first fact')),
      'provider 请求里的历史必须来自磁盘日志',
    ).toBe(true);
    expect(userTexts.some((text) => text.includes('the second fact'))).toBe(true);
  });

  it('fork mints a new session id and leaves the source session bytes untouched', async () => {
    const homeDir = await makeTempDir('byf-ac31-fork-home-');
    const workDir = await makeTempDir('byf-ac31-fork-work-');

    const harness = await newHarness(homeDir);
    const source = await harness.createSession({ id: 'ses_ac31_src', workDir });
    const sourceDir = source.summary?.sessionDir;
    expect(sourceDir).toBeDefined();
    await source.prompt('a fact worth copying');

    const sourceBefore = await settledManifest(sourceDir!);
    const sourceLinesBefore = await readMainWireLines(sourceDir!);

    const forked = await harness.forkSession({ id: 'ses_ac31_src', forkId: 'ses_ac31_dst' });
    expect(forked.id, 'fork 产生新 session ID').toBe('ses_ac31_dst');
    expect(forked.summary?.sessionDir, 'fork 落在另一个目录').not.toBe(sourceDir);
    expect(await dirManifest(sourceDir!), 'fork 之后原会话目录字节必须完全不变').toBe(sourceBefore);

    providerState.requests.length = 0;
    await forked.prompt('a different continuation');

    expect(
      providerUserTexts().some((text) => text.includes('a fact worth copying')),
      'fork 的新窗口同样由复制来的事件日志重建',
    ).toBe(true);
    await harness.close();

    // forked 会话继续生长，不能回头动源
    expect(
      await readMainWireLines(sourceDir!),
      '在子会话里 prompt 后，源会话日志必须仍然逐字节不变',
    ).toEqual(sourceLinesBefore);
    expect(await dirManifest(sourceDir!)).toBe(sourceBefore);
  });
});

// ── AC-3.4：重放安全边界在契约层可查询 ──────────────────────────────────────

/** 契约层的三档分类：只读 / 有本机副作用 / 远程不可逆。 */
const EXPECTED_REPLAY_CLASSES = ['read-only', 'side-effect', 'remote-irreversible'] as const;

describe('PRD-0038 AC-3.4 tool replay safety is a queryable contract', () => {
  it('exposes the three-way replay vocabulary and a default classifier on the SDK surface', () => {
    const surface = sdkNamespace as unknown as {
      TOOL_REPLAY_SAFETY_CLASSES?: readonly string[];
      classifyToolReplaySafety?: (toolName: string) => (typeof EXPECTED_REPLAY_CLASSES)[number];
    };

    expect(
      surface.TOOL_REPLAY_SAFETY_CLASSES,
      '@byfriends/sdk 必须导出重放分类词汇表（二元 never|safe 分不清"本机可重放"与"远程已不可逆"）',
    ).toEqual(EXPECTED_REPLAY_CLASSES);

    const classify = surface.classifyToolReplaySafety;
    expect(classify, '宿主不该各自发明分类，必须能查契约层的默认值').toBeTypeOf('function');
    for (const name of ['Read', 'Grep', 'Glob']) {
      expect(classify!(name), `${name} 是只读工具`).toBe('read-only');
    }
    expect(classify!('Write'), '本机文件写入有副作用').toBe('side-effect');
    expect(classify!('Edit'), '本机文件写入有副作用').toBe('side-effect');
    // Bash 是分类器最容易放错的一档：它既可能是只读命令也可能是不可逆操作，
    // 默认值必须落在不可重放一侧（PRD-0038 对标结论：Bash/subagent/外部改动
    // 不在任何回滚能力的覆盖范围内）。
    expect(classify!('Bash'), 'Bash 默认不得被判成可重放').not.toBe('read-only');
    // 第三档必须真的可达，否则导出一个永远返回不了的值等于没分三档：MCP 工具
    // 是"远程不可逆"的正面样本（发消息、下单、改远端状态）。
    expect(
      classify!('mcp__gmail__send_draft'),
      'MCP 工具走远端，日志重放不能假装远端回到了原位',
    ).toBe('remote-irreversible');
    // 未登记的工具必须保守归类——宁可少重放，不可重复下单
    expect(classify!('SomeUnknownMcpTool')).not.toBe('read-only');
    expect(EXPECTED_REPLAY_CLASSES).toContain(classify!('mcp__gmail__send_draft'));
  });

  it('keeps the replay classification on the same surface as the identity table', () => {
    // 两条契约必须同时存在：只有身份表而没有重放分类，面向用户的 durability 叙述
    // 仍然会暗示"事件日志可重放 = 副作用可回滚"。行为侧（不可逆工具在 resume 时
    // 不得再执行一次）在 packages/agent-core/test/harness/crash-matrix.test.ts 断言。
    const surface = sdkNamespace as unknown as Record<string, unknown>;
    expect(surface['SESSION_IDENTITY_CONTRACT'], '身份表缺失时不得只补重放分类').toBeDefined();
    expect(surface['TOOL_REPLAY_SAFETY_CLASSES'], '重放分类缺失时不得只补身份表').toBeDefined();
  });
});

// ── AC-3.4 第二半：面向用户的 durability 叙述 ───────────────────────────────

/**
 * AC-3.4 除了"分类在契约层可查询"，还要求**面向用户的 durability 叙述**明确
 * "事件日志可重放 ≠ 工具副作用可回滚"，且不暗示存在文件级事务回滚。
 *
 * 文案本身没法用行为断言，但没有门禁的"记得写文档"等于没写——本仓已有同类先例
 * `apps/cli/test/tui/printable-key-guard.test.ts`（散文纪律 → 扫描式守卫）。这里
 * 只检查最小可判定形状：做出重放/恢复叙述的那几个文件里，必须存在一句话同时
 * (1) 提到重放/恢复、(2) 提到副作用/外部状态/不可逆、(3) 带否定或对比，把两件事
 * 分开。不规定具体措辞，也不检查翻译质量。
 *
 * en 与 zh 成对要求：`docs/AGENTS.md` 规定两个 locale 同步，只补一个语言就是把
 * 另一半的读者留在错误的心智模型里。
 */
const REPO_ROOT = join(__dirname, '..', '..', '..');

const DURABILITY_NARRATIVE_FILES = [
  'docs/en/guides/sessions.md',
  'docs/zh/guides/sessions.md',
  'docs/en/configuration/data-locations.md',
  'docs/zh/configuration/data-locations.md',
  'SECURITY.md',
] as const;

const REPLAY_CLAIM = /replay|resumption|resume|重放|回放|恢复/i;
const SIDE_EFFECT_TERMS =
  /side[- ]effect|external|remote|irreversible|tool call|副作用|外部|远端|远程|不可逆|工具/i;
const SEPARATION =
  /does not|do not|not\b|never|cannot|≠|independently|无法|不代[表情]|不会|不是|不能|不可\b|并[不非]/i;

/** 按句子粗切：中英文句读 + 换行都算边界。 */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.。!?！？])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0);
}

describe('PRD-0038 AC-3.4 durability narrative states the replay boundary', () => {
  for (const relative of DURABILITY_NARRATIVE_FILES) {
    it(`${relative} separates "the log can be replayed" from "the side effects can be undone"`, () => {
      const absolute = join(REPO_ROOT, relative);
      expect(existsSync(absolute), `叙述文件必须存在：${relative}`).toBe(true);
      const lines = sentences(readFileSync(absolute, 'utf8'));
      const qualifying = lines.filter(
        (line) => REPLAY_CLAIM.test(line) && SIDE_EFFECT_TERMS.test(line) && SEPARATION.test(line),
      );
      expect(
        qualifying.length,
        `${relative} 需要一句话把"事件日志可重放"与"工具副作用可回滚"明确分开（现状：完全没有这类句子）`,
      ).toBeGreaterThan(0);
    });
  }

  it('never implies a file-level transactional rollback in that narrative', () => {
    // 反向守卫（现在是绿的）：它锁住的是**修复的边界**——补叙述时不许写成
    // "回滚到崩溃前的文件状态"。这类断言在 byf 里为假（仓内无文件内容快照能力，
    // checkpoint 只是 turn 内步骤边界，见 PRD-0038「引擎与契约事实」）。
    const rollbackImplication =
      /\b(?:rolls? back|rolled back|rollback|reverts?|reverted|undoes?|undone)\b[^\n]{0,140}\b(file|files|write|writes|edit|edits|tool|tools|change|changes)\b/i;
    const chineseRollbackImplication = /(?:回滚|撤销)[^\n]{0,60}(?:文件|写入|编辑|工具|改动)/;
    // 带否定的句子是**正确**的写法（"cannot roll back the file writes"），只有把
    // 回滚能力说成存在才算违规。
    const negation = /\b(?:not|never|cannot|can't|no)\b|≠|无法|不能|不会|不是|不可|并未|没有/i;
    const offenders: string[] = [];
    for (const relative of DURABILITY_NARRATIVE_FILES) {
      const absolute = join(REPO_ROOT, relative);
      if (!existsSync(absolute)) continue;
      for (const line of readFileSync(absolute, 'utf8').split('\n')) {
        if (negation.test(line)) continue;
        if (rollbackImplication.test(line) || chineseRollbackImplication.test(line)) {
          offenders.push(`${relative}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, '不得暗示存在文件级事务回滚').toEqual([]);
  });
});
