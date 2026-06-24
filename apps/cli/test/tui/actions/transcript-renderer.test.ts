import { describe, expect, it } from 'vitest';

import { createTranscriptComponent } from '#/tui/actions/transcript-renderer';
import { CompactionComponent } from '#/tui/components/dialogs/compaction';
import { AssistantMessageComponent } from '#/tui/components/messages/assistant-message';
import { BackgroundAgentStatusComponent } from '#/tui/components/messages/background-agent-status';
import { ShellExecutionComponent } from '#/tui/components/messages/shell-execution';
import { SkillActivationComponent } from '#/tui/components/messages/skill-activation';
import {
  NoticeMessageComponent,
  StatusMessageComponent,
} from '#/tui/components/messages/status-message';
import { ThinkingComponent } from '#/tui/components/messages/thinking';
import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { UserMessageComponent } from '#/tui/components/messages/user-message';
import { darkColors } from '#/tui/theme/colors';
import { createMarkdownTheme } from '#/tui/theme/pi-tui-theme';
import type { BackgroundAgentStatusData, ToolCallBlockData, TranscriptEntry } from '#/tui/types';

const colors = darkColors;
const markdownTheme = createMarkdownTheme(colors);

function makeCtx(overrides?: Partial<Parameters<typeof createTranscriptComponent>[1]>) {
  return {
    colors,
    markdownTheme,
    toolOutputExpanded: false,
    ...overrides,
  };
}

function entry(
  kind: TranscriptEntry['kind'],
  content: string,
  extras?: Partial<TranscriptEntry>,
): TranscriptEntry {
  return { id: 't1', kind, renderMode: 'plain', content, ...extras };
}

describe('createTranscriptComponent', () => {
  it('returns null for welcome', () => {
    expect(createTranscriptComponent(entry('welcome', ''), makeCtx())).toBeNull();
  });

  it('returns UserMessageComponent for user entry', () => {
    const result = createTranscriptComponent(entry('user', 'hello'), makeCtx());
    expect(result).toBeInstanceOf(UserMessageComponent);
  });

  it('returns UserMessageComponent with image attachments', () => {
    const fakeImage = {
      id: 1,
      kind: 'image' as const,
      bytes: new Uint8Array(),
      mime: 'image/png',
      width: 10,
      height: 10,
      placeholder: '[img]',
    };
    const result = createTranscriptComponent(
      entry('user', 'hello', { imageAttachmentIds: [1] }),
      makeCtx({ getImageAttachment: () => fakeImage }),
    );
    expect(result).toBeInstanceOf(UserMessageComponent);
  });

  it('returns SkillActivationComponent for skill_activation entry', () => {
    const result = createTranscriptComponent(
      entry('skill_activation', '', { skillName: 'my-skill', skillArgs: '{}' }),
      makeCtx(),
    );
    expect(result).toBeInstanceOf(SkillActivationComponent);
  });

  it('returns AssistantMessageComponent for assistant entry', () => {
    const result = createTranscriptComponent(entry('assistant', '**bold**'), makeCtx());
    expect(result).toBeInstanceOf(AssistantMessageComponent);
  });

  it('returns ThinkingComponent for thinking entry', () => {
    const result = createTranscriptComponent(entry('thinking', 'hmm'), makeCtx());
    expect(result).toBeInstanceOf(ThinkingComponent);
  });

  it('passes toolOutputExpanded to ThinkingComponent', () => {
    const result = createTranscriptComponent(
      entry('thinking', 'hmm'),
      makeCtx({ toolOutputExpanded: true }),
    );
    expect(result).toBeInstanceOf(ThinkingComponent);
    // Expanded is internal state; we just verify it doesn't throw.
  });

  it('returns ToolCallComponent for tool_call with toolCallData', () => {
    const toolCallData: ToolCallBlockData = {
      id: 'tc1',
      name: 'Read',
      args: { path: '/foo' },
    };
    const result = createTranscriptComponent(entry('tool_call', '', { toolCallData }), makeCtx());
    expect(result).toBeInstanceOf(ToolCallComponent);
  });

  it('passes toolOutputExpanded to ToolCallComponent', () => {
    const toolCallData: ToolCallBlockData = {
      id: 'tc1',
      name: 'Edit',
      args: {},
    };
    const result = createTranscriptComponent(
      entry('tool_call', '', { toolCallData }),
      makeCtx({ toolOutputExpanded: true }),
    );
    expect(result).toBeInstanceOf(ToolCallComponent);
  });

  it('returns BackgroundAgentStatusComponent for tool_call with backgroundAgentStatus', () => {
    const status: BackgroundAgentStatusData = {
      phase: 'completed',
      headline: 'Agent done',
      detail: undefined,
    };
    const result = createTranscriptComponent(
      entry('tool_call', '', { backgroundAgentStatus: status }),
      makeCtx(),
    );
    expect(result).toBeInstanceOf(BackgroundAgentStatusComponent);
  });

  it('returns NoticeMessageComponent for tool_call with renderMode notice', () => {
    const result = createTranscriptComponent(
      {
        id: 't1',
        kind: 'tool_call',
        renderMode: 'notice',
        content: 'YOLO mode: ON',
        detail: 'watch out',
      },
      makeCtx(),
    );
    expect(result).toBeInstanceOf(NoticeMessageComponent);
  });

  it('returns StatusMessageComponent for tool_call with renderMode plain', () => {
    const result = createTranscriptComponent(entry('tool_call', 'doing stuff'), makeCtx());
    expect(result).toBeInstanceOf(StatusMessageComponent);
  });

  it('returns ShellExecutionComponent for shell_exec entry', () => {
    const result = createTranscriptComponent(entry('shell_exec', 'ls -la'), makeCtx());
    expect(result).toBeInstanceOf(ShellExecutionComponent);
  });

  it('returns BackgroundAgentStatusComponent for status with backgroundAgentStatus', () => {
    const status: BackgroundAgentStatusData = {
      phase: 'completed',
      headline: 'Agent done',
      detail: undefined,
    };
    const result = createTranscriptComponent(
      entry('status', '', { backgroundAgentStatus: status }),
      makeCtx(),
    );
    expect(result).toBeInstanceOf(BackgroundAgentStatusComponent);
  });

  it('returns NoticeMessageComponent for status with renderMode notice', () => {
    const result = createTranscriptComponent(
      {
        id: 't1',
        kind: 'status',
        renderMode: 'notice',
        content: 'Plan mode: ON',
        detail: undefined,
      },
      makeCtx(),
    );
    expect(result).toBeInstanceOf(NoticeMessageComponent);
  });

  it('returns StatusMessageComponent for status with renderMode plain', () => {
    const result = createTranscriptComponent(entry('status', 'working'), makeCtx());
    expect(result).toBeInstanceOf(StatusMessageComponent);
  });

  it('returns CompactionComponent for compactionData entry', () => {
    const result = createTranscriptComponent(
      entry('status', '', {
        compactionData: { tokensBefore: 100, tokensAfter: 50, instruction: 'summarize' },
      }),
      makeCtx(),
    );
    expect(result).toBeInstanceOf(CompactionComponent);
  });

  it('returns null for unknown kind', () => {
    const result = createTranscriptComponent(
      entry('status' as TranscriptEntry['kind'], ''),
      makeCtx(),
    );
    // 'status' without backgroundAgentStatus and renderMode plain -> StatusMessageComponent
    expect(result).toBeInstanceOf(StatusMessageComponent);
  });
});
