/**
 * TodoPanel — live-updating TODO list shown before the input area.
 *
 * Mounted as a dedicated `Container` slot between the activity pane
 * (spinners / thinking stream) and the queue / editor block. The host
 * calls {@link setTodos} whenever the LLM invokes the `TodoList`
 * tool; state survives across turns so the list stays visible until
 * explicitly cleared (`todos: []`), a new session starts, or `/clear`
 * is issued.
 */

import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TodoItem {
  readonly title: string;
  readonly status: TodoStatus;
}

const MAX_VISIBLE_TODOS = 5;

export class TodoPanelComponent implements Component {
  private todos: readonly TodoItem[] = [];
  private colors: ColorPalette;

  constructor(colors: ColorPalette) {
    this.colors = colors;
  }

  setTodos(todos: readonly TodoItem[]): void {
    this.todos = todos.map((t) => ({ title: t.title, status: t.status }));
  }

  getTodos(): readonly TodoItem[] {
    return this.todos;
  }

  clear(): void {
    this.todos = [];
  }

  isEmpty(): boolean {
    return this.todos.length === 0;
  }

  setColors(colors: ColorPalette): void {
    this.colors = colors;
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (this.todos.length === 0) return [];
    const c = this.colors;
    const lines: string[] = [
      chalk.hex(c.border)('─'.repeat(width)),
      chalk.hex(c.primary).bold(' Todo'),
    ];
    const visible = this.todos.slice(0, MAX_VISIBLE_TODOS);
    for (const todo of visible) {
      lines.push(renderRow(todo, c));
    }

    const remaining = this.todos.length - MAX_VISIBLE_TODOS;
    if (remaining > 0) {
      lines.push(`  ${chalk.hex(c.textDim)(`+${remaining} more`)}`);
    }

    return lines.map((line) => truncateToWidth(line, width));
  }
}

function renderRow(todo: TodoItem, colors: ColorPalette): string {
  const marker = statusMarker(todo.status, colors);
  const titleStyled = styleTitle(todo.title, todo.status, colors);
  return `  ${marker} ${titleStyled}`;
}

function statusMarker(status: TodoStatus, colors: ColorPalette): string {
  switch (status) {
    case 'in_progress':
      return chalk.hex(colors.primary).bold('●');
    case 'done':
      return chalk.hex(colors.success)('✓');
    case 'pending':
      return chalk.hex(colors.textDim)('○');
  }
}

function styleTitle(title: string, status: TodoStatus, colors: ColorPalette): string {
  switch (status) {
    case 'in_progress':
      return chalk.hex(colors.text).bold(title);
    case 'done':
      return chalk.hex(colors.textDim).strikethrough(title);
    case 'pending':
      return chalk.hex(colors.text)(title);
  }
}
