/**
 * MCP 渐进披露测试（PRD-0031 1c）。
 *
 * 阈值门控：启用的 MCP 工具数 ≤ 阈值 → 全量平铺（现状行为，零回归）；
 * 超过阈值 → 全量 schema 不进 prompt（公理 C），改由 McpTools 元工具
 * 按需加载（列表 + schema + `<tools_added>` 公告），MCP 工具仍注册可执行。
 */
import type { Tool } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { MCP_DISCLOSURE_THRESHOLD } from '../../src/agent/tool';
import type { MCPClient } from '../../src/mcp/types';
import { testAgent } from '../agent/harness/agent';
import { executeTool } from '../tools/fixtures/execute-tool';

function manyToolsClient(count: number): MCPClient {
  return {
    async listTools(): Promise<Tool[]> {
      return Array.from({ length: count }, (_, i) => ({
        name: `tool_${String(i).padStart(2, '0')}`,
        description: `Tool number ${String(i)}`,
        inputSchema: {
          type: 'object',
          properties: { arg: { type: 'string' } },
        },
      }));
    },
    async callTool(name, args) {
      return {
        content: [{ type: 'text', text: `called ${name} ${JSON.stringify(args)}` }],
        isError: false,
      };
    },
  };
}

async function ctxWithMcpTools(count: number) {
  const ctx = testAgent();
  ctx.configure();
  const defs = await manyToolsClient(count).listTools();
  const tools = defs.map((d) => ({
    name: d.name,
    description: d.description,
    parameters: d.inputSchema as Record<string, unknown>,
  }));
  ctx.agent.tools.registerMcpServer('srv', manyToolsClient(count), tools);
  // 启用全部 builtin + MCP 通配（与真实 profile 的 enable 语义一致）
  const builtinNames = [...ctx.agent.tools.toolInfos()]
    .filter((info) => info.source === 'builtin')
    .map((info) => info.name);
  ctx.agent.tools.setActiveTools([...builtinNames, 'mcp__*']);
  return ctx;
}

function context(args: { tool?: string }, toolCallId = 'call_mcp_tools') {
  return { turnId: '0', toolCallId, args, signal: new AbortController().signal };
}

describe('MCP progressive disclosure (PRD-0031 1c)', () => {
  it('低于阈值：全量平铺（现状行为，零回归）', async () => {
    const ctx = await ctxWithMcpTools(3);
    const names = ctx.agent.tools.loopTools.map((t) => t.name);
    expect(names).toContain('mcp__srv__tool_00');
    expect(names).toContain('mcp__srv__tool_02');
    expect(names).not.toContain('McpTools');
  });

  it('恰好阈值（MCP_DISCLOSURE_THRESHOLD）：仍全量平铺（> 严格大于）', async () => {
    const ctx = await ctxWithMcpTools(MCP_DISCLOSURE_THRESHOLD);
    const names = ctx.agent.tools.loopTools.map((t) => t.name);
    expect(names).toContain('mcp__srv__tool_00');
    expect(names).toContain('mcp__srv__tool_19');
    expect(names).not.toContain('McpTools');
  });

  it('超过阈值：McpTools 元工具替代全量平铺，MCP 工具仍注册可执行', async () => {
    const ctx = await ctxWithMcpTools(MCP_DISCLOSURE_THRESHOLD + 1);
    const names = ctx.agent.tools.loopTools.map((t) => t.name);
    // 全量 schema 不进 prompt
    expect(names).not.toContain('mcp__srv__tool_00');
    expect(names).not.toContain('mcp__srv__tool_20');
    expect(names).toContain('McpTools');
    // 工具仍注册（toolInfos 可见，可执行）
    const infos = [...ctx.agent.tools.toolInfos()].filter((i) => i.source === 'mcp');
    expect(infos.length).toBe(MCP_DISCLOSURE_THRESHOLD + 1);
  });

  it('McpTools 无参数：列出全部可用 MCP 工具（名字 + 描述）', async () => {
    const ctx = await ctxWithMcpTools(MCP_DISCLOSURE_THRESHOLD + 1);
    const tool = ctx.agent.tools.loopTools.find((t) => t.name === 'McpTools');
    expect(tool).toBeDefined();
    const result = await executeTool(tool!, context({}));
    expect(result.isError).toBe(false);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('mcp__srv__tool_00');
    expect(output).toContain('mcp__srv__tool_20');
    expect(output).toContain('Tool number 20');
  });

  it('McpTools(tool)：返回完整 schema + <tools_added> 公告', async () => {
    const ctx = await ctxWithMcpTools(MCP_DISCLOSURE_THRESHOLD + 1);
    const tool = ctx.agent.tools.loopTools.find((t) => t.name === 'McpTools');
    const result = await executeTool(tool!, context({ tool: 'mcp__srv__tool_03' }));
    expect(result.isError).toBe(false);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('<tools_added>');
    expect(output).toContain('mcp__srv__tool_03');
    expect(output).toContain('"arg"');
  });

  it('McpTools(未知工具)：结构化错误并列出可用工具', async () => {
    const ctx = await ctxWithMcpTools(MCP_DISCLOSURE_THRESHOLD + 1);
    const tool = ctx.agent.tools.loopTools.find((t) => t.name === 'McpTools');
    const result = await executeTool(tool!, context({ tool: 'mcp__srv__nope' }));
    expect(result.isError).toBe(true);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('Unknown MCP tool');
    expect(output).toContain('mcp__srv__tool_00');
  });

  it('无 MCP 工具时列出空结果', async () => {
    const ctx = testAgent();
    ctx.configure();
    const tool = ctx.agent.tools.loopTools.find((t) => t.name === 'McpTools');
    // 低于阈值时不注入 McpTools
    expect(tool).toBeUndefined();
  });
});
