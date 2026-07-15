/**
 * `/add-dir` slash command (PRD-0023 R5).
 *
 *   /add-dir list | (no args)  → list workspace + additional roots
 *   /add-dir <path>            → choice: session-only | remember to .byf/local.toml | cancel
 */

import { ChoicePickerComponent } from '#/tui/components/dialogs/choice-picker';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

type AddDirChoice = 'session' | 'remember' | 'cancel';

export function createAddDirHandlers(
  host: SlashCommandHost,
): Record<'add-dir', SlashCommandHandler> {
  return {
    'add-dir': async (args) => {
      await handleAddDirCommand(host, args);
    },
  };
}

async function handleAddDirCommand(host: SlashCommandHost, args: string): Promise<void> {
  const input = args.trim();
  const session = host.getSession();

  if (input.length === 0 || input.toLowerCase() === 'list') {
    if (session === undefined) {
      host.showError('No active session.');
      return;
    }
    try {
      const roots = await session.getWorkspaceRoots();
      host.showStatus(formatWorkspaceRoots(roots.workspaceDir, roots.additionalDirs));
    } catch (error) {
      host.showError(error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (session === undefined) {
    host.showError('No active session.');
    return;
  }

  const sessionId = session.id;
  host.dialogHost.show(
    new ChoicePickerComponent({
      title: `Add directory to workspace: ${input}`,
      hint: '↑↓ navigate · Enter confirm · Esc cancel',
      options: [
        { value: 'session', label: 'Yes, for this session' },
        { value: 'remember', label: 'Yes, and remember this directory' },
        { value: 'cancel', label: 'No' },
      ],
      colors: host.getThemeColors(),
      searchable: false,
      onSelect: (value) => {
        host.dialogHost.close();
        void handleAddDirChoice(host, sessionId, input, value as AddDirChoice);
      },
      onCancel: () => {
        host.dialogHost.close();
        host.showStatus(`Did not add ${input} as a working directory.`);
      },
    }),
  );
}

function formatWorkspaceRoots(workspaceDir: string, additionalDirs: readonly string[]): string {
  const lines = [`Workspace: ${workspaceDir}`, 'Additional directories:'];
  if (additionalDirs.length === 0) {
    lines.push('  (none)');
  } else {
    for (const dir of additionalDirs) {
      lines.push(`  ${dir}`);
    }
  }
  return lines.join('\n');
}

async function handleAddDirChoice(
  host: SlashCommandHost,
  sessionId: string,
  path: string,
  choice: AddDirChoice,
): Promise<void> {
  if (choice === 'cancel') {
    host.showStatus(`Did not add ${path} as a working directory.`);
    return;
  }

  const session = host.getSession();
  if (session === undefined || session.id !== sessionId) {
    host.showError('No active session.');
    return;
  }

  try {
    const result = await session.addWorkspaceDir(path, { persist: choice === 'remember' });
    host.showStatus(
      choice === 'remember'
        ? `Added workspace directory:\n  ${path}\n  Saved to:\n  ${result.configPath ?? '.byf/local.toml'}`
        : `Added workspace directory:\n  ${path}\n  For this session only`,
      'success',
    );
  } catch (error) {
    host.showError(error instanceof Error ? error.message : String(error));
  }
}
