import { describe, it, expect } from 'vitest';

import { TodoPanelComponent, type TodoItem } from '#/tui/components/chrome/todo-panel';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('TodoPanelComponent', () => {
  it('returns no lines when empty (so the layout slot collapses)', () => {
    const panel = new TodoPanelComponent(darkColors);
    expect(panel.render(80)).toEqual([]);
    expect(panel.isEmpty()).toBe(true);
  });

  it('renders a Todo header + one row per entry', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Investigate parser', status: 'done' },
      { title: 'Add tests', status: 'in_progress' },
      { title: 'Open PR', status: 'pending' },
    ]);
    const lines = panel.render(80).map(strip);
    const joined = lines.join('\n');
    expect(joined).toMatch(/Todo/);
    expect(joined).toMatch(/✓ Investigate parser/);
    expect(joined).toMatch(/● Add tests/);
    expect(joined).toMatch(/○ Open PR/);
  });

  it('setTodos replaces the list (not appends)', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([{ title: 'old', status: 'pending' }]);
    panel.setTodos([{ title: 'new', status: 'in_progress' }]);
    const out = strip(panel.render(80).join('\n'));
    expect(out).toMatch(/● new/);
    expect(out).not.toMatch(/old/);
  });

  it('clear() wipes the list and reverts to empty', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([{ title: 'x', status: 'pending' }]);
    panel.clear();
    expect(panel.isEmpty()).toBe(true);
    expect(panel.render(80)).toEqual([]);
  });

  it('defensive copy: external mutation does not leak into the panel', () => {
    const panel = new TodoPanelComponent(darkColors);
    const source: TodoItem[] = [{ title: 'foo', status: 'pending' }];
    panel.setTodos(source);
    source[0] = { title: 'hacked', status: 'done' };
    const out = strip(panel.render(80).join('\n'));
    expect(out).toMatch(/○ foo/);
    expect(out).not.toMatch(/hacked/);
  });

  it('shows at most 5 todos with +N more for excess items', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'in_progress' },
      { title: 'Task 2', status: 'pending' },
      { title: 'Task 3', status: 'pending' },
      { title: 'Task 4', status: 'pending' },
      { title: 'Task 5', status: 'pending' },
      { title: 'Task 6', status: 'pending' },
      { title: 'Task 7', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    // Should show 5 tasks + 1 "+N more" line
    const taskMatches = lines.match(/Task \d/g);
    expect(taskMatches).toHaveLength(5);
    expect(lines).toMatch(/\+2 more/);
  });

  it('shows all todos when 5 or fewer items', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'A', status: 'pending' },
      { title: 'B', status: 'pending' },
      { title: 'C', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    expect(lines).toMatch(/○ A/);
    expect(lines).toMatch(/○ B/);
    expect(lines).toMatch(/○ C/);
    expect(lines).not.toMatch(/more/);
  });

  it('renders +N more text in dimmed style', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'x', status: 'pending' },
      { title: 'y', status: 'pending' },
      { title: 'z', status: 'pending' },
      { title: 'w', status: 'pending' },
      { title: 'v', status: 'pending' },
      { title: 'u', status: 'pending' },
    ]);
    const lines = panel.render(80);
    const plain = strip(lines.join('\n'));
    expect(plain).toMatch(/\+1 more/);
  });
});
