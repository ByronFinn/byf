/**
 * `wire/ops/tools` —— tools 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = `{ userTools, enabledTools, mcpAccessPatterns, store }`。MCP 工具
 * 本身不走 wire（PRD：MCP 工具不进 reducer），但 `tools.set_active_tools` 的 payload
 * 里混有 MCP glob 名（如 `mcp__*`），故 reducer 复刻 setActiveTools 的拆分：非 MCP
 * 名进 enabledTools、MCP 名进 mcpAccessPatterns（对标 tool/index.ts:297-298）。
 * builtinTools 不走 wire（由 initializeBuiltinTools 构造，属 config 的 onDidRestore）。
 */

import { z } from 'zod';

import type { UserToolRegistration } from '#/agent/tool/types';
import { defineModel } from '#/agent/wire';
import { isMcpToolName } from '#/mcp/tool-naming';

// —— zod schema ——

const userToolRegistrationSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
}) satisfies z.ZodType<UserToolRegistration>;

// —— Model ——

export interface ToolsModelState {
  /** name → 注册信息（不含 resolveExecution 闭包，那在 wiring 期重建）。 */
  readonly userTools: ReadonlyMap<string, UserToolRegistration>;
  /** 已启用的非 MCP 工具名（set_active_tools 全量替换；register 额外加）。 */
  readonly enabledTools: ReadonlySet<string>;
  /** MCP glob 名（set_active_tools 拆分出来，runtime 门控用）。 */
  readonly mcpAccessPatterns: readonly string[];
  /** 工具共享存储（update_store 累积）。 */
  readonly store: Readonly<Record<string, unknown>>;
}

export const toolsModel = defineModel(
  'tools',
  (): ToolsModelState => ({
    userTools: new Map(),
    enabledTools: new Set(),
    mcpAccessPatterns: [],
    store: {},
  }),
);

// —— Ops（纯 reducer，对标 tool/index.ts:75-120, 290-298 的状态突变） ——

export const toolsRegisterUserTool = toolsModel.defineOp('tools.register_user_tool', {
  schema: userToolRegistrationSchema,
  apply: (state, payload) => {
    const registration: UserToolRegistration = {
      name: payload.name,
      description: payload.description,
      parameters: payload.parameters,
    };
    const userTools = new Map([...state.userTools, [payload.name, registration]]);
    const enabledTools = new Set([...state.enabledTools, payload.name]);
    return { ...state, userTools, enabledTools };
  },
});

export const toolsUnregisterUserTool = toolsModel.defineOp('tools.unregister_user_tool', {
  schema: z.object({ name: z.string() }),
  apply: (state, payload) => {
    const userTools = new Map(state.userTools);
    userTools.delete(payload.name);
    const enabledTools = new Set(state.enabledTools);
    enabledTools.delete(payload.name);
    return { ...state, userTools, enabledTools };
  },
});

export const toolsSetActiveTools = toolsModel.defineOp('tools.set_active_tools', {
  schema: z.object({ names: z.array(z.string()).readonly() }),
  apply: (state, payload) => ({
    ...state,
    enabledTools: new Set(payload.names.filter((name) => !isMcpToolName(name))),
    mcpAccessPatterns: payload.names.filter((name) => isMcpToolName(name)),
  }),
});

export const toolsUpdateStore = toolsModel.defineOp('tools.update_store', {
  schema: z.object({ key: z.string(), value: z.unknown() }),
  apply: (state, payload) => ({
    ...state,
    store: { ...state.store, [payload.key]: payload.value },
  }),
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'tools.register_user_tool': typeof toolsRegisterUserTool;
    'tools.unregister_user_tool': typeof toolsUnregisterUserTool;
    'tools.set_active_tools': typeof toolsSetActiveTools;
    'tools.update_store': typeof toolsUpdateStore;
  }
}
