import type { Component, MarkdownTheme, TUI } from '@earendil-works/pi-tui';

import type { ColorPalette } from '#/tui/theme/colors';
import type { TranscriptEntry } from '#/tui/types';
import type { ImageAttachment } from '#/tui/utils/image-attachment-store';

import { CompactionComponent } from '#/tui/components/dialogs/compaction';
import { AssistantMessageComponent } from '#/tui/components/messages/assistant-message';
import { BackgroundAgentStatusComponent } from '#/tui/components/messages/background-agent-status';
import { NoticeMessageComponent, StatusMessageComponent } from '#/tui/components/messages/status-message';
import { ShellExecutionComponent } from '#/tui/components/messages/shell-execution';
import { SkillActivationComponent } from '#/tui/components/messages/skill-activation';
import { ThinkingComponent } from '#/tui/components/messages/thinking';
import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { UserMessageComponent } from '#/tui/components/messages/user-message';

export interface TranscriptRenderContext {
  readonly colors: ColorPalette;
  readonly markdownTheme: MarkdownTheme;
  readonly ui?: TUI;
  readonly workDir?: string;
  readonly toolOutputExpanded: boolean;
  readonly getImageAttachment?: (id: number) => ImageAttachment | undefined;
}

export function createTranscriptComponent(
  entry: TranscriptEntry,
  ctx: TranscriptRenderContext,
): Component | null {
  if (entry.compactionData !== undefined) {
    const data = entry.compactionData;
    const block = new CompactionComponent(ctx.colors, ctx.ui, data.instruction);
    block.markDone(data.tokensBefore, data.tokensAfter);
    return block;
  }

  switch (entry.kind) {
    case 'user': {
      const images = entry.imageAttachmentIds
        ?.map((id) => ctx.getImageAttachment?.(id))
        .filter((a): a is ImageAttachment => a?.kind === 'image');
      return new UserMessageComponent(entry.content, ctx.colors, images);
    }
    case 'skill_activation':
      return new SkillActivationComponent(
        entry.skillName ?? entry.content,
        entry.skillArgs,
        ctx.colors,
      );
    case 'assistant': {
      const component = new AssistantMessageComponent(ctx.markdownTheme, ctx.colors);
      component.updateContent(entry.content);
      return component;
    }
    case 'thinking': {
      const thinking = new ThinkingComponent(entry.content, ctx.colors, true);
      if (ctx.toolOutputExpanded) thinking.setExpanded(true);
      return thinking;
    }
    case 'tool_call':
      if (entry.toolCallData) {
        const tc = new ToolCallComponent(
          entry.toolCallData,
          entry.toolCallData.result,
          ctx.colors,
          ctx.ui,
          ctx.markdownTheme,
          ctx.workDir,
        );
        if (ctx.toolOutputExpanded) tc.setExpanded(true);
        return tc;
      }
      if (entry.backgroundAgentStatus !== undefined) {
        return new BackgroundAgentStatusComponent(entry.backgroundAgentStatus, ctx.colors);
      }
      return entry.renderMode === 'notice'
        ? new NoticeMessageComponent(entry.content, entry.detail, ctx.colors)
        : new StatusMessageComponent(entry.content, ctx.colors, entry.color);
    case 'shell_exec':
      return new ShellExecutionComponent({
        command: entry.content,
        result: entry.toolCallData?.result,
        colors: ctx.colors,
        expanded: ctx.toolOutputExpanded,
        showCommand: true,
      });
    case 'status':
      if (entry.backgroundAgentStatus !== undefined) {
        return new BackgroundAgentStatusComponent(entry.backgroundAgentStatus, ctx.colors);
      }
      return entry.renderMode === 'notice'
        ? new NoticeMessageComponent(entry.content, entry.detail, ctx.colors)
        : new StatusMessageComponent(entry.content, ctx.colors, entry.color);
    case 'welcome':
      return null;
    default:
      return null;
  }
}
