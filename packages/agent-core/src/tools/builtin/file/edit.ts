/**
 * EditTool — exact string replacement in a file.
 *
 * Replaces the first occurrence of `old_string` with `new_string` by
 * default. When `replace_all` is true, replaces all occurrences.
 * Errors when `old_string` is not found or not unique (when
 * `replace_all=false`). Path access policy is resolved before any
 * Kaos I/O.
 */

import type { Kaos } from '@byfriends/kaos';
import { z } from 'zod';

import type { BuiltinTool } from '../../../agent/tool';
import { ToolAccesses } from '../../../loop/tool-access';
import type { ExecutableToolResult, ToolExecution } from '../../../loop/types';
import { resolvePathAccessPath } from '../../policies/path-access';
import { toInputJsonSchema } from '../../support/input-schema';
import type { WorkspaceConfig } from '../../support/workspace';
import EDIT_DESCRIPTION from './edit.md';
import { materializeModelText, toModelTextView } from './line-endings';
import type { ReadFileTracker } from './read-state';

// `old_string` must be non-empty: the non-replace_all branch walks
// occurrences with `content.indexOf("", pos)`, which would loop forever
// on an empty search string.
export const EditInputSchema = z.object({
  path: z
    .string()
    .describe(
      'Path to the text file to edit. Relative paths resolve against the working directory; a path outside the working directory must be absolute.',
    ),
  old_string: z
    .string()
    .min(1)
    .describe(
      'Exact content to replace from the Read output view, without the line-number prefix. Use LF for pure CRLF files; use actual \\r escapes where Read shows \\r.',
    ),
  new_string: z
    .string()
    .describe(
      'Replacement text in the same Read output view. LF is written back as CRLF only for pure CRLF files.',
    ),
  replace_all: z
    .boolean()
    .optional()
    .describe('Set true only when every occurrence of old_string should be replaced.'),
});

export type EditInput = z.Infer<typeof EditInputSchema>;

function replaceOnceLiteral(content: string, oldString: string, newString: string): string {
  const index = content.indexOf(oldString);
  if (index === -1) return content;
  return content.slice(0, index) + newString + content.slice(index + oldString.length);
}

/**
 * When old_string is not found, the file has drifted from what the model
 * last saw. Surface the real on-disk content (first lines, Read-style
 * `lineNo\tline`) so the model can copy the exact text as its new
 * old_string instead of guessing and retrying blind. Bounded so a huge
 * file cannot exhaust the context.
 *
 * The snapshot lines come straight from disk. Any literal `<system>` /
 * `</system>` inside the file is neutralized so the content cannot forge
 * a system status block and confuse the renderer.
 */
const NOT_FOUND_SNAPSHOT_LINES = 50;

function neutralizeSystemTags(line: string): string {
  // Turn literal <system> / </system> into visible, non-executing text so
  // file content cannot forge a status block in the rendered output.
  return line.replaceAll('<system>', '&lt;system>').replaceAll('</system>', '&lt;/system>');
}

function notFoundWithSnapshot(path: string, content: string): string {
  const lines = content.split('\n');
  const total = lines.length;
  const shown = lines.slice(0, NOT_FOUND_SNAPSHOT_LINES);
  const snapshot = shown
    .map((line, i) => `${String(i + 1)}\t${neutralizeSystemTags(line)}`)
    .join('\n');
  const truncatedNote =
    total > NOT_FOUND_SNAPSHOT_LINES
      ? `\n<system>Showing first ${String(NOT_FOUND_SNAPSHOT_LINES)} of ${String(total)} lines. Use Read with line_offset to view other regions.</system>`
      : '';
  return (
    `old_string not found in ${path}. The file may have changed since you last read it. ` +
    `Current content — copy the exact text below as your new old_string:\n\n` +
    snapshot +
    truncatedNote
  );
}

export class EditTool implements BuiltinTool<EditInput> {
  readonly name = 'Edit' as const;
  readonly description = EDIT_DESCRIPTION;
  readonly parameters: Record<string, unknown> = toInputJsonSchema(EditInputSchema);

  constructor(
    private readonly kaos: Kaos,
    private readonly workspace: WorkspaceConfig,
    private readonly readTracker?: ReadFileTracker,
  ) {}

  resolveExecution(args: EditInput): ToolExecution {
    const path = resolvePathAccessPath(args.path, {
      kaos: this.kaos,
      workspace: this.workspace,
      operation: 'write',
    });
    return {
      accesses: ToolAccesses.readWriteFile(path),
      description: `Editing ${args.path}`,
      execute: () => this.execution(args, path),
    };
  }

  private async execution(args: EditInput, safePath: string): Promise<ExecutableToolResult> {
    if (args.old_string === args.new_string) {
      return {
        isError: true,
        output: 'No changes to make: old_string and new_string are exactly the same.',
      };
    }

    // Fail fast when the file has not been Read in this session. The
    // Edit contract requires old_string to come from a current Read view;
    // editing without one almost always drifts (stale memory, truncated
    // context, parallel edits) and produces a wasted disk read + retry.
    if (this.readTracker !== undefined && !this.readTracker.hasRead(safePath)) {
      return {
        isError: true,
        output: `You must Read ${args.path} before editing it. Use the Read tool first, then retry the Edit with the exact content from the Read output.`,
      };
    }

    try {
      const raw = await this.kaos.readText(safePath);
      const modelView = toModelTextView(raw);
      const content = modelView.text;
      const replaceAll = args.replace_all ?? false;

      if (!replaceAll) {
        let count = 0;
        let pos = 0;
        while (pos < content.length) {
          const idx = content.indexOf(args.old_string, pos);
          if (idx === -1) break;
          count++;
          pos = idx + args.old_string.length;
        }

        if (count === 0) {
          return {
            isError: true,
            output: notFoundWithSnapshot(args.path, content),
          };
        }
        if (count > 1) {
          return {
            isError: true,
            output:
              `old_string is not unique in ${args.path} (found ${String(count)} occurrences). ` +
              'To replace every occurrence, set replace_all=true. To replace only one occurrence, include more surrounding context in old_string.',
          };
        }

        const newContent = replaceOnceLiteral(content, args.old_string, args.new_string);
        await this.kaos.writeText(
          safePath,
          materializeModelText(newContent, modelView.lineEndingStyle),
        );
        return { output: `Replaced 1 occurrence in ${args.path}` };
      }

      const parts = content.split(args.old_string);
      const replacementCount = parts.length - 1;
      if (replacementCount === 0) {
        return {
          isError: true,
          output: notFoundWithSnapshot(args.path, content),
        };
      }

      const newContent = parts.join(args.new_string);
      await this.kaos.writeText(
        safePath,
        materializeModelText(newContent, modelView.lineEndingStyle),
      );
      return { output: `Replaced ${String(replacementCount)} occurrences in ${args.path}` };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'EISDIR') {
        return { isError: true, output: `${args.path} is not a file.` };
      }
      return {
        isError: true,
        output: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
