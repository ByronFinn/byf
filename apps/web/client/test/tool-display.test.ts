import { describe, expect, test } from 'vitest';

import { displayCommand, summarizeDisplay } from '../src/lib/tool-display';

/**
 * command 类 display 的取值契约:展开体「查看/复制命令」依赖它拿到完整命令
 * 文本(被拒绝/取消的调用没有结果输出,命令只能从这里来)。
 */
describe('displayCommand', () => {
  test('returns the full command for command display', () => {
    const display = {
      kind: 'command',
      command: 'bun test packages/agent-core',
      cwd: '/tmp/proj',
      language: 'bash',
    };
    expect(displayCommand(display)).toBe('bun test packages/agent-core');
  });

  test('returns null for non-command kinds', () => {
    expect(displayCommand({ kind: 'file_io', operation: 'write', path: '/a' })).toBeNull();
    expect(displayCommand({ kind: 'generic', summary: 'x' })).toBeNull();
  });

  test('returns null for missing or empty command', () => {
    expect(displayCommand({ kind: 'command' })).toBeNull();
    expect(displayCommand({ kind: 'command', command: '' })).toBeNull();
  });

  test('returns null for null/non-object display', () => {
    expect(displayCommand(null)).toBeNull();
    expect(displayCommand(undefined)).toBeNull();
    expect(displayCommand('command')).toBeNull();
  });

  test('summarizeDisplay keeps showing description and command for rejected calls', () => {
    const display = { kind: 'command', command: 'rm -rf /tmp/x', description: 'clean tmp' };
    expect(summarizeDisplay(display)).toBe('clean tmp — rm -rf /tmp/x');
  });
});
