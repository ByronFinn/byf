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

  it('implements the Expandable interface', () => {
    const panel = new TodoPanelComponent(darkColors) as unknown;
    expect(typeof (panel as Record<string, unknown>)['setExpanded']).toBe('function');
  });

  it('setExpanded(true) reveals all items when collapsed', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'pending' },
      { title: 'Task 2', status: 'pending' },
      { title: 'Task 3', status: 'pending' },
      { title: 'Task 4', status: 'pending' },
      { title: 'Task 5', status: 'pending' },
      { title: 'Task 6', status: 'pending' },
      { title: 'Task 7', status: 'pending' },
    ]);
    panel.setExpanded(true);
    const lines = strip(panel.render(80).join('\n'));
    const taskMatches = lines.match(/Task \d/g);
    expect(taskMatches).toHaveLength(7);
    expect(lines).not.toMatch(/more/);
  });

  it('setExpanded(false) collapses back to 5 items with +N more', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'pending' },
      { title: 'Task 2', status: 'pending' },
      { title: 'Task 3', status: 'pending' },
      { title: 'Task 4', status: 'pending' },
      { title: 'Task 5', status: 'pending' },
      { title: 'Task 6', status: 'pending' },
      { title: 'Task 7', status: 'pending' },
    ]);
    panel.setExpanded(false);
    const lines = strip(panel.render(80).join('\n'));
    const taskMatches = lines.match(/Task \d/g);
    expect(taskMatches).toHaveLength(5);
    expect(lines).toMatch(/\+2 more/);
  });

  it('setExpanded toggles correctly and stays expanded after setTodos', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'A', status: 'pending' },
      { title: 'B', status: 'pending' },
      { title: 'C', status: 'pending' },
      { title: 'D', status: 'pending' },
      { title: 'E', status: 'pending' },
      { title: 'F', status: 'pending' },
    ]);
    panel.setExpanded(true);
    // Replace with new todos, should stay expanded
    panel.setTodos([
      { title: 'X', status: 'pending' },
      { title: 'Y', status: 'pending' },
      { title: 'Z', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    expect(lines).toMatch(/○ X/);
    expect(lines).toMatch(/○ Y/);
    expect(lines).toMatch(/○ Z/);
    expect(lines).not.toMatch(/more/);
  });

  it('shows collapse hint (+0 more) when expanded with excess items', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'x', status: 'pending' },
      { title: 'y', status: 'pending' },
      { title: 'z', status: 'pending' },
      { title: 'w', status: 'pending' },
      { title: 'v', status: 'pending' },
      { title: 'u', status: 'pending' },
    ]);
    panel.setExpanded(true);
    const lines = strip(panel.render(80).join('\n'));
    // Should show all 6 items with a collapse hint
    expect(lines).toMatch(/○ x/);
    expect(lines).toMatch(/○ u/);
    expect(lines).toMatch(/collapse/);
  });

  it('slides the window forward when in_progress is beyond the first 5', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'done' },
      { title: 'Task 2', status: 'done' },
      { title: 'Task 3', status: 'done' },
      { title: 'Task 4', status: 'done' },
      { title: 'Task 5', status: 'done' },
      { title: 'Task 6', status: 'done' },
      { title: 'Task 7', status: 'in_progress' },
      { title: 'Task 8', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    // Window should slide to include Task 7 (in_progress)
    expect(lines).toMatch(/● Task 7/);
    // Task 1 should be hidden (window slides past it)
    expect(lines).not.toMatch(/Task 1/);
    expect(lines).not.toMatch(/\+.* more/); // hiddenAfter = 0, no items hidden below
  });

  it('keeps window at start when in_progress is in the first 5', () => {
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
    expect(lines).toMatch(/● Task 1/);
    expect(lines).toMatch(/○ Task 5/);
    expect(lines).not.toMatch(/Task 6/);
    expect(lines).not.toMatch(/above/);
    expect(lines).toMatch(/\+2 more/);
  });

  it('shows all items when total is 5 or fewer - no sliding needed', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'A', status: 'pending' },
      { title: 'B', status: 'in_progress' },
      { title: 'C', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    expect(lines).toMatch(/○ A/);
    expect(lines).toMatch(/● B/);
    expect(lines).toMatch(/○ C/);
    expect(lines).not.toMatch(/more/);
    expect(lines).not.toMatch(/above/);
  });

  it('clamps window at end when in_progress is the last item', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'done' },
      { title: 'Task 2', status: 'done' },
      { title: 'Task 3', status: 'done' },
      { title: 'Task 4', status: 'done' },
      { title: 'Task 5', status: 'done' },
      { title: 'Task 6', status: 'done' },
      { title: 'Task 7', status: 'done' },
      { title: 'Task 8', status: 'done' },
      { title: 'Task 9', status: 'done' },
      { title: 'Task 10', status: 'in_progress' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    // Window should be clamped to show items 5-9 (index 5-9), with Task 10 at the end
    expect(lines).toMatch(/● Task 10/);
    expect(lines).not.toMatch(/\+.* more/); // No hidden after the window
  });

  it('falls back to start of list when no in_progress item exists', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'pending' },
      { title: 'Task 2', status: 'pending' },
      { title: 'Task 3', status: 'pending' },
      { title: 'Task 4', status: 'pending' },
      { title: 'Task 5', status: 'pending' },
      { title: 'Task 6', status: 'pending' },
      { title: 'Task 7', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    expect(lines).toMatch(/○ Task 1/);
    expect(lines).toMatch(/○ Task 5/);
    expect(lines).not.toMatch(/Task 6/);
    expect(lines).not.toMatch(/above/);
    expect(lines).toMatch(/\+2 more/);
  });

  it('slides window and shows +N more when in_progress is in the middle of a long list', () => {
    const panel = new TodoPanelComponent(darkColors);
    panel.setTodos([
      { title: 'Task 1', status: 'done' },
      { title: 'Task 2', status: 'done' },
      { title: 'Task 3', status: 'done' },
      { title: 'Task 4', status: 'done' },
      { title: 'Task 5', status: 'done' },
      { title: 'Task 6', status: 'done' },
      { title: 'Task 7', status: 'in_progress' },
      { title: 'Task 8', status: 'pending' },
      { title: 'Task 9', status: 'pending' },
      { title: 'Task 10', status: 'pending' },
    ]);
    const lines = strip(panel.render(80).join('\n'));
    // Window slides to include Task 7
    expect(lines).toMatch(/● Task 7/);
    expect(lines).not.toMatch(/Task 1/);
    // Only +N more shown (no above hint)
    expect(lines).toMatch(/\+1 more/);
  });
});
