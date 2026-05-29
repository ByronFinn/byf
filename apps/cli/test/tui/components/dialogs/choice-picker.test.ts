import type { ModelAlias } from '@byfriends/sdk';
import { describe, expect, it, vi } from 'vitest';

import { ChoicePickerComponent } from '#/tui/components/dialogs/choice-picker';
import { EditorSelectorComponent } from '#/tui/components/dialogs/editor-selector';
import { ModelSelectorComponent, type ThinkingEffortLevel } from '#/tui/components/dialogs/model-selector';
import { PermissionSelectorComponent } from '#/tui/components/dialogs/permission-selector';
import { SettingsSelectorComponent } from '#/tui/components/dialogs/settings-selector';
import { ThemeSelectorComponent } from '#/tui/components/dialogs/theme-selector';
import { darkColors } from '#/tui/theme/colors';

const ANSI_SGR = /\[[0-9;]*m/g;

function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

describe('ChoicePickerComponent', () => {
  it('renders optional descriptions below choice labels', () => {
    const picker = new ChoicePickerComponent({
      title: 'Select permission mode',
      options: [
        {
          value: 'manual',
          label: 'Manual',
          description: 'Ask before commands, edits, and other risky actions.',
        },
        {
          value: 'auto',
          label: 'Auto',
          description: 'Automatically approve tool actions and plan transitions.',
        },
      ],
      currentValue: 'manual',
      colors: darkColors,
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });

    const out = picker.render(120).map(strip);

    expect(out).toContain('  ❯ Manual ← current');
    expect(out).toContain('    Ask before commands, edits, and other risky actions.');
    expect(out).toContain('    Automatically approve tool actions and plan transitions.');
  });

  it('renders domain selector wrappers with their configured options', () => {
    const onSelect = vi.fn();
    const onCancel = vi.fn();

    const editor = new EditorSelectorComponent({
      currentValue: 'vim',
      colors: darkColors,
      onSelect,
      onCancel,
    });
    expect(editor.render(120).map(strip)).toContain('  ❯ Vim ← current');

    const model = new ModelSelectorComponent({
      models: {
        byf: {
          provider: 'managed:byf',
          model: 'byf-k2',
          maxContextSize: 200_000,
          displayName: 'ByF K2',
          capabilities: ['thinking'],
        },
      },
      currentValue: 'byf',
      currentThinkingEffort: 'high',
      colors: darkColors,
      onSelect,
      onCancel,
    });
    const modelOutput = model.render(120).map(strip);
    expect(modelOutput).toContain('  ❯ ByF K2 (byf) ← current');
    expect(modelOutput).toContain(' Thinking');
    expect(modelOutput).toContain('  [ On ]    Off  ');

    const theme = new ThemeSelectorComponent({
      currentValue: 'light',
      colors: darkColors,
      onSelect,
      onCancel,
    });
    expect(theme.render(120).map(strip)).toContain('  ❯ Light ← current');

    const permission = new PermissionSelectorComponent({
      currentValue: 'manual',
      colors: darkColors,
      onSelect,
      onCancel,
    });
    expect(permission.render(120).map(strip)).toContain('  ❯ Manual ← current');

    const settings = new SettingsSelectorComponent({
      colors: darkColors,
      onSelect,
      onCancel,
    });
    const settingsOutput = settings.render(120).map(strip);
    expect(settingsOutput).toContain('  ❯ Model');
    expect(settingsOutput).toContain('    Switch the active model and thinking mode.');
  });

  it('submits the selected model and inline thinking effort', () => {
    const onSelect = vi.fn();
    const picker = new ModelSelectorComponent({
      models: {
        byf: {
          provider: 'managed:byf',
          model: 'byf-k2',
          maxContextSize: 200_000,
          displayName: 'Byf K2',
          capabilities: ['thinking'],
        },
      },
      currentValue: 'byf',
      currentThinkingEffort: 'high',
      colors: darkColors,
      onSelect,
      onCancel: vi.fn(),
    });

    picker.handleInput('[C');
    picker.handleInput('\r');

    expect(onSelect).toHaveBeenCalledWith({ alias: 'byf', thinkingEffort: 'off' });
  });

  it('forces always-thinking models on and unsupported models off', () => {
    const onSelect = vi.fn();
    const picker = new ModelSelectorComponent({
      models: {
        always: {
          provider: 'managed:byf',
          model: 'byf-thinking',
          maxContextSize: 200_000,
          displayName: 'Byf Thinking',
          capabilities: ['always_thinking'],
        },
        plain: {
          provider: 'managed:byf',
          model: 'byf-plain',
          maxContextSize: 200_000,
          displayName: 'Byf Plain',
          capabilities: ['tool_use'],
        },
      },
      currentValue: 'always',
      currentThinkingEffort: 'off',
      colors: darkColors,
      onSelect,
      onCancel: vi.fn(),
    });

    expect(picker.render(120).map(strip)).toContain('  [ Always on ]');
    picker.handleInput('[C');
    picker.handleInput('\r');
    expect(onSelect).toHaveBeenLastCalledWith({ alias: 'always', thinkingEffort: 'high' });

    picker.handleInput('[B');
    expect(picker.render(120).map(strip)).toContain('  [ Off ] unsupported');
    picker.handleInput('[D');
    picker.handleInput('\r');
    expect(onSelect).toHaveBeenLastCalledWith({ alias: 'plain', thinkingEffort: 'off' });
  });

  it('keeps the thinking draft when moving across models', () => {
    const onSelect = vi.fn();
    const picker = new ModelSelectorComponent({
      models: {
        plain: {
          provider: 'managed:byf',
          model: 'byf-plain',
          maxContextSize: 200_000,
          displayName: 'Byf Plain',
          capabilities: ['tool_use'],
        },
        thinking: {
          provider: 'managed:byf',
          model: 'byf-thinking',
          maxContextSize: 200_000,
          displayName: 'Byf Thinking',
          capabilities: ['thinking'],
        },
      },
      currentValue: 'plain',
      currentThinkingEffort: 'off',
      colors: darkColors,
      onSelect,
      onCancel: vi.fn(),
    });

    picker.handleInput('[B');
    picker.handleInput('[D');
    picker.handleInput('[A');
    picker.handleInput('[B');
    picker.handleInput('\r');

    expect(onSelect).toHaveBeenCalledWith({ alias: 'thinking', thinkingEffort: 'high' });
  });

  it('coerces effort draft to binary thinking for toggle-only models', () => {
    const onSelect = vi.fn();
    const picker = new ModelSelectorComponent({
      models: {
        effort: {
          provider: 'openai',
          model: 'o3',
          maxContextSize: 200_000,
          displayName: 'OpenAI o3',
          capabilities: ['thinking_effort'],
        },
        toggle: {
          provider: 'managed:byf',
          model: 'byf-thinking',
          maxContextSize: 200_000,
          displayName: 'Byf Thinking',
          capabilities: ['thinking'],
        },
      },
      currentValue: 'effort',
      currentThinkingEffort: 'medium',
      colors: darkColors,
      onSelect,
      onCancel: vi.fn(),
    });

    picker.handleInput('[B');
    picker.handleInput('\r');

    expect(onSelect).toHaveBeenCalledWith({ alias: 'toggle', thinkingEffort: 'high' });
  });

  it('shows effort selector for models with thinking_effort capability', () => {
    const onSelect = vi.fn();
    const picker = new ModelSelectorComponent({
      models: {
        o3: {
          provider: 'openai',
          model: 'o3',
          maxContextSize: 200_000,
          displayName: 'OpenAI o3',
          capabilities: ['thinking_effort'],
        },
      },
      currentValue: 'o3',
      currentThinkingEffort: 'medium',
      colors: darkColors,
      onSelect,
      onCancel: vi.fn(),
    });

    const output = rendered(picker);
    expect(output).toContain('Off');
    expect(output).toContain('Low');
    expect(output).toContain('[ Medium ]');
    expect(output).toContain('High');

    // Right arrow cycles to high
    picker.handleInput('[C');
    expect(rendered(picker)).toContain('[ High ]');

    // Left arrow cycles back to medium, then low, then off
    picker.handleInput('[D');
    expect(rendered(picker)).toContain('[ Medium ]');

    picker.handleInput('[D');
    expect(rendered(picker)).toContain('[ Low ]');

    picker.handleInput('[D');
    expect(rendered(picker)).toContain('[ Off ]');

    // Can't go below off
    picker.handleInput('[D');
    expect(rendered(picker)).toContain('[ Off ]');

    // Enter submits the selected level
    picker.handleInput('[C'); // low
    picker.handleInput('\r');
    expect(onSelect).toHaveBeenCalledWith({ alias: 'o3', thinkingEffort: 'low' });
  });

  it('cannot go above high in effort selector', () => {
    const picker = new ModelSelectorComponent({
      models: {
        o3: {
          provider: 'openai',
          model: 'o3',
          maxContextSize: 200_000,
          capabilities: ['thinking_effort'],
        },
      },
      currentValue: 'o3',
      currentThinkingEffort: 'high',
      colors: darkColors,
      onSelect: vi.fn(),
      onCancel: vi.fn(),
    });

    picker.handleInput('[C');
    expect(rendered(picker)).toContain('[ High ]');
  });
});

const ESC = String.fromCodePoint(27);
const BACKSPACE = String.fromCodePoint(127);
const PAGE_UP = `${ESC}[5~`;
const PAGE_DOWN = `${ESC}[6~`;
const LEFT = `${ESC}[D`;
const RIGHT = `${ESC}[C`;
const ENTER = String.fromCodePoint(13);

function rendered(component: { render: (w: number) => string[] }, width = 80): string {
  return component.render(width).map(strip).join('\n');
}

describe('ChoicePickerComponent search and pagination', () => {
  function makePicker(over: { options?: { value: string; label: string }[]; searchable?: boolean }) {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const picker = new ChoicePickerComponent({
      title: 'Select a provider',
      options:
        over.options ??
        ['openai', 'openrouter', 'anthropic', 'google', 'mistral', 'cohere'].map((label) => ({
          value: label,
          label,
        })),
      colors: darkColors,
      searchable: over.searchable ?? true,
      onSelect,
      onCancel,
    });
    return { picker, onSelect, onCancel };
  }

  function type(picker: ChoicePickerComponent, query: string): void {
    for (const ch of query) picker.handleInput(ch);
  }

  it('filters the list as the user types and echoes the query', () => {
    const { picker } = makePicker({});
    type(picker, 'open');
    const out = rendered(picker);
    expect(out).toContain('Search: open');
    expect(out).toContain('openai');
    expect(out).toContain('openrouter');
    expect(out).not.toContain('anthropic');
    expect(out).not.toContain('google');
  });

  it('trims the query on Backspace and clears it on Esc before cancelling', () => {
    const { picker, onCancel } = makePicker({});
    type(picker, 'open');
    expect(rendered(picker)).toContain('Search: open');

    picker.handleInput(BACKSPACE);
    expect(rendered(picker)).toContain('Search: ope');

    picker.handleInput(ESC); // non-empty query → clear, do not cancel
    expect(onCancel).not.toHaveBeenCalled();
    expect(rendered(picker)).not.toContain('Search:');
    expect(rendered(picker)).toContain('anthropic'); // full list restored

    picker.handleInput(ESC); // empty query → cancel
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Enter selects the highlighted item from the filtered list', () => {
    const { picker, onSelect } = makePicker({});
    type(picker, 'router'); // only openrouter matches
    picker.handleInput(ENTER);
    expect(onSelect).toHaveBeenCalledWith('openrouter');
  });

  it('shows "No matches" and selects nothing when the query matches nothing', () => {
    const { picker, onSelect } = makePicker({});
    type(picker, 'zzzz');
    expect(rendered(picker)).toContain('No matches');
    picker.handleInput(ENTER);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('splits a long list into pages and pages with PageDown and Right', () => {
    const options = Array.from({ length: 20 }, (_, i) => {
      const label = `item${String(i).padStart(2, '0')}`;
      return { value: label, label };
    });
    const { picker } = makePicker({ options, searchable: false });

    expect(rendered(picker)).toContain('Page 1/3');
    expect(rendered(picker)).toContain('item00');
    expect(rendered(picker)).not.toContain('item08');

    picker.handleInput(PAGE_DOWN);
    expect(rendered(picker)).toContain('Page 2/3');
    expect(rendered(picker)).toContain('item08');
    expect(rendered(picker)).not.toContain('item00');

    picker.handleInput(RIGHT);
    expect(rendered(picker)).toContain('Page 3/3');
    expect(rendered(picker)).toContain('item19');
  });

  it('omits the page footer for a short list', () => {
    const { picker } = makePicker({ searchable: false });
    expect(rendered(picker)).not.toContain('Page ');
  });
});

describe('ModelSelectorComponent search and pagination', () => {
  function buildModels(count: number): Record<string, ModelAlias> {
    const models: Record<string, ModelAlias> = {};
    for (let i = 0; i < count; i++) {
      const id = `model${String(i).padStart(2, '0')}`;
      models[`prov/${id}`] = {
        provider: 'prov',
        model: id,
        maxContextSize: 1000,
        capabilities: ['thinking'],
      };
    }
    return models;
  }

  function makeSelector(models: Record<string, ModelAlias>, currentThinkingEffort: ThinkingEffortLevel = 'high') {
    const onSelect = vi.fn();
    const onCancel = vi.fn();
    const firstAlias = Object.keys(models)[0] ?? '';
    const selector = new ModelSelectorComponent({
      models,
      currentValue: firstAlias,
      currentThinkingEffort,
      colors: darkColors,
      searchable: true,
      onSelect,
      onCancel,
    });
    return { selector, onSelect, onCancel };
  }

  it('filters models as the user types', () => {
    const { selector } = makeSelector({
      'p/alpha': { provider: 'p', model: 'alpha', maxContextSize: 1000 },
      'p/beta': { provider: 'p', model: 'beta', maxContextSize: 1000 },
      'p/gamma': { provider: 'p', model: 'gamma', maxContextSize: 1000 },
    });
    for (const ch of 'beta') selector.handleInput(ch);
    const out = rendered(selector);
    expect(out).toContain('Search: beta');
    expect(out).toContain('beta (p)');
    expect(out).not.toContain('alpha (p)');
    expect(out).not.toContain('gamma (p)');
  });

  it('pages with PageDown/PageUp while Left/Right still toggle thinking', () => {
    const { selector } = makeSelector(buildModels(20));

    expect(rendered(selector)).toContain('Page 1/3');
    expect(rendered(selector)).toContain('model00 (prov)');
    expect(rendered(selector)).not.toContain('model08 (prov)');

    selector.handleInput(PAGE_DOWN);
    expect(rendered(selector)).toContain('Page 2/3');
    expect(rendered(selector)).toContain('model08 (prov)');

    // Right toggles thinking off and must NOT change the page.
    selector.handleInput(RIGHT);
    expect(rendered(selector)).toContain('Page 2/3');
    expect(rendered(selector)).toContain('[ Off ]');

    // Left toggles thinking back on, page still unchanged.
    selector.handleInput(LEFT);
    expect(rendered(selector)).toContain('Page 2/3');
    expect(rendered(selector)).toContain('[ On ]');

    selector.handleInput(PAGE_UP);
    expect(rendered(selector)).toContain('Page 1/3');
  });
});
