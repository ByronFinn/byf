/**
 * TodoPanel — 输入区前实时更新的 TODO 列表。
 *
 * 挂载在活动面板(spinners / 思考流)与队列 / 编辑器块之间的专用
 * `Container` 槽位。LLM 每次调用 `TodoList` 工具时宿主调用
 * {@link setTodos};状态跨 turn 存活,列表保持可见,直到显式清空
 * (`todos: []`)、新会话开始或发出 `/clear`。
 *
 * 实现 {@link Expandable},使宿主可在折叠视图(最多 5 项 + "+N more")
 * 与完全展开视图(全部项 + "collapse" 提示)间切换。经编辑器按键系统
 * 使用 `Ctrl+T`(见 `custom-editor.ts`)。
 */

import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import type { Expandable } from '#/tui/utils/component-capabilities';

export type TodoStatus = 'pending' | 'in_progress' | 'done';

export interface TodoItem {
  readonly title: string;
  readonly status: TodoStatus;
}

const MAX_VISIBLE_TODOS = 5;

export class TodoPanelComponent implements Component, Expandable {
  private todos: readonly TodoItem[] = [];
  private colors: ColorPalette;
  private expanded = false;

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

  /** @inheritdoc */
  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
  }

  /** Returns whether the panel is currently showing the full list. */
  isExpanded(): boolean {
    return this.expanded;
  }

  render(width: number): string[] {
    if (this.todos.length === 0) return [];
    const c = this.colors;
    const lines: string[] = [
      chalk.hex(c.border)('─'.repeat(width)),
      chalk.hex(c.primary).bold(' Todo'),
    ];

    if (this.expanded) {
      // Show all items with a collapse hint when there are more than MAX_VISIBLE.
      for (const todo of this.todos) {
        lines.push(renderRow(todo, c));
      }
      if (this.todos.length > MAX_VISIBLE_TODOS) {
        lines.push(`  ${chalk.hex(c.textDim)('▲ collapse (ctrl+t)')}`);
      }
    } else {
      const total = this.todos.length;
      if (total <= MAX_VISIBLE_TODOS) {
        for (const todo of this.todos) {
          lines.push(renderRow(todo, c));
        }
      } else {
        const inProgressIndex = this.todos.findIndex((t) => t.status === 'in_progress');
        let start = 0;
        if (inProgressIndex >= 0) {
          start = Math.max(
            0,
            Math.min(
              inProgressIndex - Math.floor(MAX_VISIBLE_TODOS / 2),
              total - MAX_VISIBLE_TODOS,
            ),
          );
        }
        const visible = this.todos.slice(start, start + MAX_VISIBLE_TODOS);
        for (const todo of visible) {
          lines.push(renderRow(todo, c));
        }
        const hiddenAfter = total - start - MAX_VISIBLE_TODOS;
        if (hiddenAfter > 0) {
          lines.push(`  ${chalk.hex(c.textDim)(`+${hiddenAfter} more (ctrl+t to expand)`)}`);
        }
      }
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
