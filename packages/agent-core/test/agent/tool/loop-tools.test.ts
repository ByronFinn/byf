import { describe, expect, it } from 'vitest';

import type { Tool } from '@byfriends/kosong';

import type { MCPClient } from '../../../src/mcp/types';
import { testAgent } from '../harness/agent';

function mockMcpClient(): MCPClient {
  return {
    listTools: async () => [],
    callTool: async () => ({ content: [], isError: false }),
  };
}

function makeTool(name: string): Tool {
  return {
    name,
    description: `${name} tool`,
    parameters: { type: 'object', properties: {} },
  };
}

describe('ToolManager.loopTools stability ordering', () => {
  it('places builtin tools before MCP tools', () => {
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'mcp__*'],
    });
    const agent = ctx.agent;

    // Register MCP tools from two servers
    const client = mockMcpClient();
    agent.tools.registerMcpServer('github', client, [
      makeTool('search'),
      makeTool('create_issue'),
    ]);
    agent.tools.registerMcpServer('slack', client, [makeTool('send')]);

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    // Separate builtin and MCP names
    const builtinNames = names.filter((n) => !n.startsWith('mcp__'));
    const mcpToolNames = names.filter((n) => n.startsWith('mcp__'));

    // All builtin tools must come before all MCP tools
    if (mcpToolNames.length > 0) {
      const firstMcpIndex = names.indexOf(mcpToolNames[0]!);
      for (const bn of builtinNames) {
        expect(names.indexOf(bn)).toBeLessThan(firstMcpIndex);
      }
    }
  });

  it('sorts builtin tools alphabetically', () => {
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'],
    });
    const agent = ctx.agent;

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    // All are builtin (no MCP tools registered)
    const builtinNames = names.filter((n) => !n.startsWith('mcp__'));

    // Should be sorted alphabetically
    const sorted = [...builtinNames].toSorted();
    expect(builtinNames).toEqual(sorted);
  });

  it('preserves MCP tool registration order (grouped by server, connection order)', () => {
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'mcp__*'],
    });
    const agent = ctx.agent;

    const client = mockMcpClient();

    // Register servers in specific order: github first, then slack
    agent.tools.registerMcpServer('github', client, [
      makeTool('search'),
      makeTool('create_issue'),
    ]);
    agent.tools.registerMcpServer('slack', client, [makeTool('send')]);

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    const mcpNames = names.filter((n) => n.startsWith('mcp__'));

    // github tools should come before slack tools (connection order)
    const githubNames = mcpNames.filter((n) => n.startsWith('mcp__github__'));
    const slackNames = mcpNames.filter((n) => n.startsWith('mcp__slack__'));

    if (githubNames.length > 0 && slackNames.length > 0) {
      const lastGithubIdx = Math.max(...githubNames.map((n) => names.indexOf(n)));
      const firstSlackIdx = Math.min(...slackNames.map((n) => names.indexOf(n)));
      expect(lastGithubIdx).toBeLessThan(firstSlackIdx);
    }

    // Within github, tools should be in registration order
    expect(githubNames).toEqual(['mcp__github__search', 'mcp__github__create_issue']);
  });

  it('places user tools between builtin and MCP tools', () => {
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'Write', 'Bash', 'mcp__*'],
    });
    const agent = ctx.agent;

    // Register a user tool
    agent.tools.registerUserTool({
      name: 'my_custom_tool',
      description: 'A custom tool',
      parameters: { type: 'object', properties: {} },
    });

    // Register an MCP tool
    const client = mockMcpClient();
    agent.tools.registerMcpServer('github', client, [makeTool('search')]);

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    const builtinNames = names.filter((n) => !n.startsWith('mcp__') && n !== 'my_custom_tool');
    const userName = names.indexOf('my_custom_tool');
    const mcpNames = names.filter((n) => n.startsWith('mcp__'));

    // User tool should be present
    expect(userName).toBeGreaterThanOrEqual(0);

    // All builtin before user tool
    for (const bn of builtinNames) {
      expect(names.indexOf(bn)).toBeLessThan(userName);
    }

    // User tool before all MCP tools
    if (mcpNames.length > 0) {
      const firstMcpIdx = Math.min(...mcpNames.map((n) => names.indexOf(n)));
      expect(userName).toBeLessThan(firstMcpIdx);
    }
  });

  it('keeps cache endpoint stable when MCP tools disconnect', () => {
    // When all MCP tools are removed, the last tool should be the last
    // builtin tool (alphabetically), ensuring the cache endpoint is stable.
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'Write', 'Edit', 'Bash', 'mcp__*'],
    });
    const agent = ctx.agent;

    const client = mockMcpClient();
    agent.tools.registerMcpServer('github', client, [makeTool('search')]);

    // Get tools WITH MCP
    const toolsWithMcp = agent.tools.loopTools;
    const namesWithMcp = toolsWithMcp.map((t) => t.name);

    // Remove MCP server
    agent.tools.unregisterMcpServer('github');

    // Get tools WITHOUT MCP
    const toolsWithoutMcp = agent.tools.loopTools;
    const namesWithoutMcp = toolsWithoutMcp.map((t) => t.name);

    // Builtin tools should remain in same order
    const builtinWithMcp = namesWithMcp.filter((n) => !n.startsWith('mcp__'));
    const builtinWithoutMcp = namesWithoutMcp.filter((n) => !n.startsWith('mcp__'));

    expect(builtinWithMcp).toEqual(builtinWithoutMcp);

    // The last builtin tool should be the same - it's the "sentinel"
    // When MCP tools are present, the last builtin is still at the boundary
    // When MCP tools disconnect, the last builtin becomes the overall last tool
    const lastBuiltinWithMcp = builtinWithMcp.at(-1);
    const lastToolWithoutMcp = namesWithoutMcp.at(-1);
    expect(lastBuiltinWithMcp).toBe(lastToolWithoutMcp);
  });

  it('does not include disabled MCP tools', () => {
    const ctx = testAgent();
    // Only allow Read builtin tool, no MCP access pattern
    ctx.configure({
      tools: ['Read'],
    });
    const agent = ctx.agent;

    const client = mockMcpClient();
    agent.tools.registerMcpServer('github', client, [makeTool('search')]);

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    // No MCP tools should be present (no mcp__* pattern)
    expect(names.every((n) => !n.startsWith('mcp__'))).toBe(true);
  });

  it('does not include disabled builtin tools', () => {
    const ctx = testAgent();
    ctx.configure({
      tools: ['Read', 'Bash'], // Only Read and Bash enabled
    });
    const agent = ctx.agent;

    const tools = agent.tools.loopTools;
    const names = tools.map((t) => t.name);

    // Should only have Read and Bash, and they should be sorted
    expect(names).toEqual(['Bash', 'Read']);
  });
});
