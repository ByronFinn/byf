/**
 * builtin 工具契约测试（PRD-0031 1b）。
 *
 * 每个 builtin 工具的 name / description / schema / 参数语义有可测试契约：
 *   1. 工具名列表与快照一致（新增/移除/改名 → CI 红，人工同步契约）；
 *   2. 结构性不变量：name 合法、description 非空且包含工具名与关键语义短语、
 *      parameters 是带类型属性的 JSON schema、必填字段被 schema 约束；
 *   3. 语义契约表（descriptionMarkers / params / required）逐工具断言——
 *      工具面语义漂移（如 Read 丢了 `path` 参数、Bash 描述不再提及 command）
 *      时契约测试失败，防止无意识漂移。
 *
 * 覆盖范围：默认主 agent 的核心 builtin 工具（18 个）。依赖可选注入的
 * 工具（Skill/Agent/WebSearch/FetchURL/ReadMediaFile）由各自聚焦测试覆盖，
 * 不在此契约表内。
 */
import { describe, expect, it } from 'vitest';

import type { Tool } from '../../src/tools';
import { testAgent } from '../agent/harness/agent';

interface ToolContract {
  /** 描述必须包含的关键语义短语（语义漂移门禁）。 */
  readonly descriptionMarkers: readonly string[];
  /** 参数 schema 必须暴露的属性名。 */
  readonly params: readonly string[];
  /** 必填参数。 */
  readonly required: readonly string[];
}

const TOOL_CONTRACTS: Readonly<Record<string, ToolContract>> = {
  Read: {
    descriptionMarkers: ['read', 'file'],
    params: ['path', 'line_offset', 'n_lines'],
    required: ['path'],
  },
  Write: {
    descriptionMarkers: ['write', 'file'],
    params: ['path', 'content'],
    required: ['path', 'content'],
  },
  Edit: {
    descriptionMarkers: ['edit', 'replace'],
    params: ['path', 'old_string', 'new_string'],
    required: ['path', 'old_string', 'new_string'],
  },
  Grep: {
    descriptionMarkers: ['search', 'pattern'],
    params: ['pattern', 'path'],
    required: ['pattern'],
  },
  Glob: {
    descriptionMarkers: ['pattern', 'file'],
    params: ['pattern'],
    required: ['pattern'],
  },
  Bash: {
    descriptionMarkers: ['command', 'shell'],
    params: ['command', 'cwd', 'timeout', 'description', 'run_in_background', 'disable_timeout'],
    required: ['command'],
  },
  AskUserQuestion: {
    descriptionMarkers: ['question', 'user'],
    params: ['questions'],
    required: ['questions'],
  },
  TodoList: {
    descriptionMarkers: ['todo'],
    params: ['todos'],
    required: [],
  },
  TaskList: {
    descriptionMarkers: ['background', 'task'],
    params: ['active_only', 'limit'],
    required: [],
  },
  TaskOutput: {
    descriptionMarkers: ['task', 'output'],
    params: ['task_id', 'block'],
    required: ['task_id'],
  },
  TaskStop: {
    descriptionMarkers: ['task', 'stop'],
    params: ['task_id'],
    required: ['task_id'],
  },
  CreateGoal: {
    descriptionMarkers: ['goal'],
    params: ['objective', 'replace', 'budget'],
    required: ['objective'],
  },
  GetGoal: {
    descriptionMarkers: ['goal'],
    params: [],
    required: [],
  },
  SetGoalBudget: {
    descriptionMarkers: ['goal', 'budget'],
    params: ['turn_budget', 'token_budget'],
    required: [],
  },
  UpdateGoal: {
    descriptionMarkers: ['goal'],
    params: ['status', 'reason'],
    required: ['status'],
  },
  CronCreate: {
    descriptionMarkers: ['cron', 'schedule'],
    params: ['cron', 'prompt', 'recurring'],
    required: ['cron', 'prompt'],
  },
  CronList: {
    descriptionMarkers: ['cron'],
    params: [],
    required: [],
  },
  CronDelete: {
    descriptionMarkers: ['cron'],
    params: ['id'],
    required: ['id'],
  },
};

describe('builtin tool contracts (PRD-0031 1b)', () => {
  function builtinTools(): Tool[] {
    const ctx = testAgent();
    ctx.configure();
    // 建一个 goal 使 goal-mutation 工具（SetGoalBudget/UpdateGoal）通过
    // loopTools 的 hasGoal 门（PRD-0019 R7）——契约覆盖全部 builtin。
    ctx.agent.goal.createGoal('contract test');
    // toolInfos 枚举全部 builtin（含未启用）；setActiveTools 全量启用后
    // loopTools 携带真实 parameters 返回。
    const names = [...ctx.agent.tools.toolInfos()]
      .filter((info) => info.source === 'builtin')
      .map((info) => info.name);
    void ctx.rpc.setActiveTools({ names });
    return ctx.agent.tools.loopTools.filter((t) => !t.name.startsWith('mcp__'));
  }

  it('工具名列表稳定（新增/移除/改名 → 同步契约表）', () => {
    const names = builtinTools()
      .map((t) => t.name)
      .toSorted();
    expect(names).toMatchInlineSnapshot(`
      [
        "AskUserQuestion",
        "Bash",
        "CreateGoal",
        "CronCreate",
        "CronDelete",
        "CronList",
        "Edit",
        "GetGoal",
        "Glob",
        "Grep",
        "Read",
        "SetGoalBudget",
        "TaskList",
        "TaskOutput",
        "TaskStop",
        "TodoList",
        "UpdateGoal",
        "Write",
      ]
    `);
  });

  it('每个 builtin 工具满足结构性契约', () => {
    const tools = builtinTools();
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name, tool.name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(tool.description, `${tool.name} description`).toBeTruthy();
      const nameWords = tool.name
        .replaceAll(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(' ');
      const descLower = tool.description.toLowerCase();
      expect(
        nameWords.some((w) => descLower.includes(w)),
        `${tool.name} description reflects its name`,
      ).toBe(true);
      expect(tool.parameters, `${tool.name} parameters`).toBeTypeOf('object');
      const schema = tool.parameters as {
        type?: string;
        properties?: Record<string, { type?: string }>;
      };
      expect(schema.properties, `${tool.name} properties`).toBeTypeOf('object');
      for (const [param, prop] of Object.entries(schema.properties ?? {})) {
        expect(prop.type, `${tool.name}.${param} has a JSON-schema type`).toBeTypeOf('string');
      }
    }
  });

  it('语义契约表：description 关键短语 + 参数表面', () => {
    const tools = builtinTools();
    const byName = new Map(tools.map((t) => [t.name, t] as const));
    for (const [name, contract] of Object.entries(TOOL_CONTRACTS)) {
      const tool = byName.get(name);
      expect(tool, `contract for ${name} — tool exists`).toBeDefined();
      if (tool === undefined) continue;
      const desc = tool.description.toLowerCase();
      for (const marker of contract.descriptionMarkers) {
        expect(desc, `${name} description mentions "${marker}"`).toContain(marker);
      }
      const schema = tool.parameters as {
        properties?: Record<string, unknown>;
        required?: string[];
      };
      for (const param of contract.params) {
        expect(schema.properties, `${name} has ${param}`).toHaveProperty(param);
      }
      for (const req of contract.required) {
        expect(schema.required ?? [], `${name} requires ${req}`).toContain(req);
      }
    }
  });

  it('每个契约表条目都对应一个真实工具（契约不悬空）', () => {
    const names = new Set(builtinTools().map((t) => t.name));
    for (const name of Object.keys(TOOL_CONTRACTS)) {
      expect(names, `contract ${name} maps to a live tool`).toContain(name);
    }
  });
});
