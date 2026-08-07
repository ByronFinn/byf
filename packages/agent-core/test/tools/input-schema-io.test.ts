/**
 * Project-level guard: every builtin tool must expose its parameter schema
 * to the model as an *input* JSON Schema.
 *
 * zod v4's default `toJSONSchema` serializes the *output* view, which marks
 * any field carrying a chain-tail `.default()` as `required`. A schema that
 * advertises both `default` and `required` for the same field is internally
 * contradictory, and — worse — the runtime AJV validator rejects otherwise
 * legal tool calls that omit those defaulted fields.
 *
 * These tests pin the correct behavior: defaulted fields stay optional in the
 * exposed schema, and a minimal `{}` call passes runtime argument validation.
 */

import { describe, expect, it } from 'vitest';

import {
  coerceToolArgs,
  compileToolArgsValidator,
  validateToolArgs,
} from '../../src/tools/args-validator';
import { TaskListTool } from '../../src/tools/background/task-list';
import { AskUserQuestionTool } from '../../src/tools/builtin/collaboration/ask-user';
import { ReadTool } from '../../src/tools/builtin/file/read';

/** Collect every `required` array nested anywhere inside a JSON Schema. */
function collectRequired(schema: unknown, acc: string[] = []): string[] {
  if (Array.isArray(schema)) {
    for (const item of schema) collectRequired(item, acc);
    return acc;
  }
  if (typeof schema !== 'object' || schema === null) return acc;
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'required' && Array.isArray(value)) {
      for (const name of value) if (typeof name === 'string') acc.push(name);
    } else {
      collectRequired(value, acc);
    }
  }
  return acc;
}

describe('builtin tool input JSON Schema', () => {
  it('keeps AskUserQuestion defaulted fields out of `required`', () => {
    const schema = new AskUserQuestionTool({} as never).parameters;
    const required = collectRequired(schema);
    // `header`, `multi_select` and option `description` all carry `.default()`
    // and must therefore stay optional in the model-facing schema.
    expect(required).not.toContain('header');
    expect(required).not.toContain('multi_select');
    expect(required).not.toContain('description');
  });

  it('keeps TaskList defaulted field out of `required`', () => {
    const schema = new TaskListTool({} as never).parameters;
    expect(collectRequired(schema)).not.toContain('active_only');
  });

  it('accepts an empty `{}` TaskList call through runtime argument validation', () => {
    const tool = new TaskListTool({} as never);
    const validator = compileToolArgsValidator(tool.parameters);
    // `TaskList()` with no arguments is the documented default usage.
    expect(validateToolArgs(validator, {})).toBeNull();
  });

  it('rejects an unknown top-level argument through runtime validation', () => {
    const tool = new AskUserQuestionTool({} as never);
    const validator = compileToolArgsValidator(tool.parameters);
    const question = {
      question: 'Which?',
      options: [
        { label: 'A', description: '' },
        { label: 'B', description: '' },
      ],
    };
    // A misspelled / hallucinated argument must surface as an invalid-args
    // error rather than being silently accepted and dropped.
    expect(validateToolArgs(validator, { questions: [question], bogus: true })).not.toBeNull();
  });

  it('rejects an unknown nested argument through runtime validation', () => {
    const tool = new AskUserQuestionTool({} as never);
    const validator = compileToolArgsValidator(tool.parameters);
    const question = {
      question: 'Which?',
      options: [
        { label: 'A', description: '' },
        { label: 'B', description: '' },
      ],
      bogus: true,
    };
    // The closed-object guard must hold at every nesting level.
    expect(validateToolArgs(validator, { questions: [question] })).not.toBeNull();
  });
});

describe('coerceToolArgs', () => {
  const readSchema = new ReadTool({} as never, {} as never).parameters;

  it('coerces string-encoded integer for line_offset', () => {
    // Models sometimes serialize numbers as strings ("5" instead of 5).
    // The coerced result must pass AJV validation.
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: '5' });
    expect(coerced).toEqual({ path: '/tmp/a.txt', line_offset: 5 });
    expect(validateToolArgs(compileToolArgsValidator(readSchema), coerced)).toBeNull();
  });

  it('coerces string-encoded negative integer for line_offset', () => {
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: '-3' });
    expect(coerced).toEqual({ path: '/tmp/a.txt', line_offset: -3 });
    expect(validateToolArgs(compileToolArgsValidator(readSchema), coerced)).toBeNull();
  });

  it('coerces string-encoded integer for n_lines', () => {
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', n_lines: '20' });
    expect(coerced).toEqual({ path: '/tmp/a.txt', n_lines: 20 });
    expect(validateToolArgs(compileToolArgsValidator(readSchema), coerced)).toBeNull();
  });

  it('leaves native integers untouched', () => {
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: 5, n_lines: 2 });
    expect(coerced).toEqual({ path: '/tmp/a.txt', line_offset: 5, n_lines: 2 });
  });

  it('drops null for optional fields', () => {
    // null on an optional field means "not specified" — same as omitting the key.
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: null });
    expect(coerced).toEqual({ path: '/tmp/a.txt' });
  });

  it('does not coerce non-integer strings', () => {
    // "abc" is not a valid integer — left as-is so AJV rejects it.
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: 'abc' });
    expect(coerced).toEqual({ path: '/tmp/a.txt', line_offset: 'abc' });
    expect(validateToolArgs(compileToolArgsValidator(readSchema), coerced)).not.toBeNull();
  });

  it('does not coerce floats', () => {
    // 5.5 is not an integer — left as-is so AJV rejects it.
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt', line_offset: '5.5' });
    expect(coerced).toEqual({ path: '/tmp/a.txt', line_offset: '5.5' });
    expect(validateToolArgs(compileToolArgsValidator(readSchema), coerced)).not.toBeNull();
  });

  it('does not touch string fields', () => {
    // `path` is declared as `type: string` — must remain a string.
    const coerced = coerceToolArgs(readSchema, { path: '/tmp/a.txt' });
    expect(coerced).toEqual({ path: '/tmp/a.txt' });
  });

  it('does not touch boolean fields', () => {
    const taskListSchema = new TaskListTool({} as never).parameters;
    const coerced = coerceToolArgs(taskListSchema, { active_only: true, limit: 5 });
    expect(coerced).toEqual({ active_only: true, limit: 5 });
  });
});
