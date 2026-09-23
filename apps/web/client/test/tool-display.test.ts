import { describe, expect, test } from 'bun:test';

import { displayCommand, summarizeDisplay } from '../src/lib/tool-display';
import type { ToolInputDisplay } from '../src/types';

/**
 * command 类 display 的取值契约:展开体「查看/复制命令」依赖它拿到完整命令
 * 文本(被拒绝/取消的调用没有结果输出,命令只能从这里来)。
 *
 * 夹具按 AC-6.1 的派生类型 `ToolInputDisplay` 构造(command 变体的 `command`
 * 字段是必填),不再写「能过 `unknown` 的形状」——旧版可传入缺 command 的对象或
 * 裸字符串,现在联合类型在编译期就排除这类输入,`null`/`undefined` 才是合法的
 * 「无展示载荷」。
 */
describe('displayCommand', () => {
  test('returns the full command for command display', () => {
    const display: ToolInputDisplay = {
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

  test('returns null for empty command', () => {
    expect(displayCommand({ kind: 'command', command: '' })).toBeNull();
  });

  test('returns null for absent display', () => {
    expect(displayCommand(null)).toBeNull();
    expect(displayCommand(undefined)).toBeNull();
  });

  test('summarizeDisplay keeps showing description and command for rejected calls', () => {
    const display: ToolInputDisplay = {
      kind: 'command',
      command: 'rm -rf /tmp/x',
      description: 'clean tmp',
    };
    expect(summarizeDisplay(display)).toBe('clean tmp — rm -rf /tmp/x');
  });
});
