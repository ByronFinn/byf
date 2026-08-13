/**
 * McpToolsTool — MCP 渐进披露（PRD-0031 1c）。
 *
 * 当启用的 MCP 工具数超过 `MCP_DISCLOSURE_THRESHOLD` 时，`loopTools` 不再
 * 把全量 MCP schema 平铺进 prompt（公理 C：上下文有界），改由本元工具
 * 按需加载：
 *   - 无参数调用 → 列出全部可用 MCP 工具（server::tool — 描述）；
 *   - `tool` 参数 → 返回该工具的完整 JSON schema 并附 `<tools_added>` 公告，
 *     模型随后即可按名直接调用（工具始终注册、可执行，只是不在 prompt）。
 *
 * 横切约束（缓存稳定）：本工具是静态 builtin（name/description/schema
 * 固定），MCP 工具 churn 不再影响 tools 前缀——超阈值后前缀一次成型。
 */

import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { toInputJsonSchema } from '../../support/input-schema';

export interface McpToolSummary {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}

export const McpToolsInputSchema = z.object({
  tool: z
    .string()
    .optional()
    .describe(
      'Qualified MCP tool name (e.g. `mcp__server__tool`) to load its full JSON schema. Omit to list all available MCP tools with their descriptions.',
    ),
});

export type McpToolsInput = z.infer<typeof McpToolsInputSchema>;

const DESCRIPTION = [
  'Load and inspect Model Context Protocol (MCP) tools.',
  '',
  'When many MCP servers are connected, MCP tools are disclosed progressively: call this tool ' +
    'with no arguments to list every available MCP tool (`mcp__server__tool` — description), then ' +
    "call it with the `tool` argument to load a specific tool's full JSON schema. Once loaded, " +
    'the tool can be called directly by name with arguments matching that schema.',
  '',
  "Always load a tool's schema before calling it — unloaded MCP tools are not available to call.",
].join('\n');

export class McpToolsTool implements BuiltinTool<McpToolsInput> {
  readonly name = 'McpTools' as const;
  readonly description: string = DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(McpToolsInputSchema);

  constructor(
    /** 只读快照：当前启用的 MCP 工具摘要（由 ToolManager 提供）。 */
    private readonly listTools: () => readonly McpToolSummary[],
  ) {}

  resolveExecution(args: McpToolsInput): ToolExecution {
    return {
      description:
        args.tool === undefined ? 'Listing MCP tools' : `Loading MCP tool schema: ${args.tool}`,
      execute: async (): Promise<ExecutableToolResult> => {
        const tools = this.listTools();
        if (args.tool === undefined) {
          return this.listResult(tools);
        }
        const match = tools.find((t) => t.name === args.tool);
        if (match === undefined) {
          const known = tools.map((t) => t.name).join(', ');
          return {
            isError: true,
            output:
              `Unknown MCP tool "${args.tool}". Available tools: ${known.length > 0 ? known : '(none)'}. ` +
              `List them first by calling McpTools with no arguments.`,
          };
        }
        return this.loadResult(match);
      },
    };
  }

  private listResult(tools: readonly McpToolSummary[]): ExecutableToolResult {
    if (tools.length === 0) {
      return { isError: false, output: 'No MCP tools are currently connected.' };
    }
    const lines = tools.map(
      (t) => `- \`${t.name}\` — ${t.description.trim().split('\n')[0] ?? '(no description)'}`,
    );
    return {
      isError: false,
      output: `Available MCP tools (${String(tools.length)}):\n${lines.join('\n')}\n\nLoad a tool's full schema with the "tool" argument, then call it directly by name.`,
    };
  }

  private loadResult(tool: McpToolSummary): ExecutableToolResult {
    const schema = JSON.stringify(tool.parameters, null, 2);
    return {
      isError: false,
      output:
        `<tools_added>\nTool "${tool.name}" is now loaded.\n` +
        `Call it directly by name with arguments matching the JSON schema below.\n</tools_added>\n\n` +
        `${schema}`,
    };
  }
}
