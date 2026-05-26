import { describe, expect, it } from 'vitest';

import {
  getBuiltinToolDefaultPermission,
  isDefaultAutoAllowTool,
} from '../../src/tools/policies/default-permissions';

describe('builtin tool default permissions', () => {
  it('marks read-only and interaction tools as auto-allow', () => {
    for (const toolName of ['Read', 'Glob', 'TodoList', 'AskUserQuestion', 'Agent']) {
      expect(isDefaultAutoAllowTool(toolName), toolName).toBe(true);
    }
  });

  it('marks side-effectful tools as ask', () => {
    for (const toolName of ['Bash', 'Write', 'Edit', 'TaskStop']) {
      expect(getBuiltinToolDefaultPermission(toolName), toolName).toBe('ask');
    }
  });

  it('leaves external and MCP tools unspecified', () => {
    expect(getBuiltinToolDefaultPermission('mcp__server__tool')).toBeUndefined();
    expect(isDefaultAutoAllowTool('external-tool')).toBe(false);
  });
});
