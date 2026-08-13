/**
 * 工具输出 schema 运行时校验测试（PRD-0031 2c）。
 *
 * - validator 单元：结构化畸形输出 → 结构化错误（含校验失败原因）；
 *   字符串/文本数组豁免（合法输出零回归）；错误结果跳过；合法结构化输出通过。
 * - 工具接线：Bash/Write/Grep/Read/Agent 声明 outputSchema（取代 drift-guard）。
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { validateStructuredOutput } from '../../src/loop/tool-call';
import type { ExecutableToolResult } from '../../src/loop/types';
import { AgentTool } from '../../src/tools/builtin/collaboration/agent';
import { GrepTool } from '../../src/tools/builtin/file/grep';
import { ReadTool } from '../../src/tools/builtin/file/read';
import { WriteTool } from '../../src/tools/builtin/file/write';
import { BashTool } from '../../src/tools/builtin/shell/bash';

const TestOutputSchema = z.object({
  bytesWritten: z.number().int().nonnegative(),
});

function ok(result: ExecutableToolResult): ExecutableToolResult {
  return result;
}

describe('validateStructuredOutput (PRD-0031 2c)', () => {
  it('畸形结构化输出 → 结构化错误（含校验失败原因，公理 A）', () => {
    const result = validateStructuredOutput(
      ok({ output: { bytesWritten: 'not-a-number' } }),
      TestOutputSchema,
      'TestTool',
    );
    expect(result.isError).toBe(true);
    const output = typeof result.output === 'string' ? result.output : '';
    expect(output).toContain('violates its declared output schema');
    expect(output).toContain('bytesWritten');
    expect(output).toContain('TestTool');
  });

  it('合法结构化输出通过（零回归）', () => {
    const result = validateStructuredOutput(
      ok({ output: { bytesWritten: 42 } }),
      TestOutputSchema,
      'TestTool',
    );
    expect(result.isError).toBeFalsy();
    expect((result as { output: unknown }).output).toEqual({ bytesWritten: 42 });
  });

  it('字符串输出是文本通道，豁免校验', () => {
    const result = validateStructuredOutput(
      ok({ output: 'plain text' }),
      TestOutputSchema,
      'TestTool',
    );
    expect(result.isError).toBeFalsy();
  });

  it('文本内容数组豁免校验', () => {
    const result = validateStructuredOutput(
      ok({ output: [{ type: 'text', text: 'hello' }] }),
      TestOutputSchema,
      'TestTool',
    );
    expect(result.isError).toBeFalsy();
  });

  it('错误结果跳过校验', () => {
    const result = validateStructuredOutput(
      { output: 'already failed', isError: true },
      TestOutputSchema,
      'TestTool',
    );
    expect(result.isError).toBe(true);
    expect(typeof result.output === 'string' ? result.output : '').toBe('already failed');
  });

  it('未声明 outputSchema 的工具不校验（全量兼容）', () => {
    const result = validateStructuredOutput(
      ok({ output: { anything: true } }),
      undefined,
      'TestTool',
    );
    expect(result.isError).toBeFalsy();
  });
});

describe('工具接线（PRD-0031 2c）', () => {
  it('Bash/Write/Grep/Read 声明其输出契约（取代 drift-guard）', () => {
    const bash = new BashTool({} as never, '/workspace', {
      osKind: 'Linux',
      osArch: 'arm64',
      osVersion: 'test',
      shellPath: '/bin/bash',
      shellName: 'bash',
    });
    expect(bash.outputSchema).toBeDefined();
    const write = new WriteTool({} as never, {} as never, {} as never, {} as never);
    expect(write.outputSchema).toBeDefined();
    const grep = new GrepTool({} as never, {} as never);
    expect(grep.outputSchema).toBeDefined();
    const read = new ReadTool({} as never, {} as never, {} as never);
    expect(read.outputSchema).toBeDefined();
  });
});
