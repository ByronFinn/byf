/**
 * ReadGroupComponent 把同一步骤中的 2+ 个 Read 工具调用渲染为一组。
 *
 * 它遵循 `AgentGroupComponent` 的相同结构,表面更小:
 * - 一个摘要头 + 列出各文件路径与状态的树形主体;
 * - 永久分组,主体保持可见;
 * - 200ms 节流,与 AgentGroup 一致;
 * - 状态留在各 `ToolCallComponent`;组只读取快照。
 *
 * 头部形式:
 *   pending > 0: Reading {N} files
 *   all done:    Read {N} files · {L} lines
 *   some failed: append · {F} failed
 *   all failed:  Read {N} files · failed
 *
 * 主体行遵循 AgentGroup 的分支样式:
 *   src/main.ts · 51 lines
 *   src/cli.ts · reading
 *   src/missing.ts · failed
 */

import type { TUI } from '@earendil-works/pi-tui';
import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';

import type { ToolCallComponent, ToolCallReadSnapshot } from './tool-call';

const THROTTLE_MS = 200;

interface ReadEntry {
  readonly toolCallId: string;
  readonly tc: ToolCallComponent;
  unsubscribe: (() => void) | undefined;
}

export class ReadGroupComponent extends Container {
  private readonly entries: ReadEntry[] = [];
  private readonly headerText: Text;
  private readonly bodyContainer: Container;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushPhases = new Map<string, ToolCallReadSnapshot['phase']>();

  constructor(
    private readonly colors: ColorPalette,
    private readonly ui: TUI | undefined,
  ) {
    super();
    this.addChild(new Spacer(1));
    this.headerText = new Text('', 0, 0);
    this.addChild(this.headerText);
    this.bodyContainer = new Container();
    this.addChild(this.bodyContainer);
  }

  size(): number {
    return this.entries.length;
  }

  /**
   * Borrows a standalone `ToolCallComponent` into the group as a hidden state
   * container. Snapshot changes trigger throttled refreshes. Re-attaching the
   * same toolCallId is a no-op.
   */
  attach(toolCallId: string, tc: ToolCallComponent): void {
    if (this.entries.some((e) => e.toolCallId === toolCallId)) return;
    const entry: ReadEntry = {
      toolCallId,
      tc,
      unsubscribe: tc.addSnapshotListener(() => {
        this.scheduleRender();
      }),
    };
    this.entries.push(entry);
    this.flushRender();
  }

  /**
   * The pending -> done/failed transition is the important visible change, so
   * it refreshes immediately. Other changes are throttled.
   */
  private scheduleRender(): void {
    if (this.detectPhaseTransition()) {
      this.flushRender();
      return;
    }
    if (this.throttleTimer !== null) return;
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.flushRender();
    }, THROTTLE_MS);
  }

  private detectPhaseTransition(): boolean {
    for (const e of this.entries) {
      const phase = e.tc.getReadSnapshot().phase;
      if (this.lastFlushPhases.get(e.toolCallId) !== phase) return true;
    }
    return false;
  }

  private flushRender(): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }

    const snapshots = this.entries.map((e) => e.tc.getReadSnapshot());
    let pending = 0;
    let failed = 0;
    let totalLines = 0;
    for (const snap of snapshots) {
      if (snap.phase === 'pending') pending += 1;
      else if (snap.phase === 'failed') failed += 1;
      else totalLines += snap.lines;
    }
    this.headerText.setText(this.buildHeader(snapshots.length, pending, failed, totalLines));

    this.bodyContainer.clear();
    const visibleSnapshots = snapshots.filter(
      (snap) => snap.filePath !== undefined && snap.filePath.length > 0,
    );
    visibleSnapshots.forEach((snap, idx) => {
      const isLast = idx === visibleSnapshots.length - 1;
      this.bodyContainer.addChild(new Text(this.buildBodyLine(snap, isLast), 0, 0));
    });

    this.lastFlushPhases.clear();
    this.entries.forEach((entry, i) => {
      const snap = snapshots[i];
      if (snap !== undefined) this.lastFlushPhases.set(entry.toolCallId, snap.phase);
    });

    this.invalidate();
    this.ui?.requestRender();
  }

  private buildHeader(total: number, pending: number, failed: number, totalLines: number): string {
    const colors = this.colors;
    const dim = chalk.dim;

    if (pending > 0) {
      const bullet = chalk.hex(colors.roleAssistant)(STATUS_BULLET);
      const label = chalk.hex(colors.primary).bold(`Reading ${String(total)} files…`);
      return `${bullet}${label}`;
    }

    // All reads have finished, either successfully or with failures.
    if (failed === total) {
      const bullet = chalk.hex(colors.error)('✗ ');
      const label = chalk.hex(colors.error).bold(`Read ${String(total)} files`);
      return `${bullet}${label}${chalk.hex(colors.error)(' · failed')}`;
    }

    const bullet = chalk.hex(colors.success)(STATUS_BULLET);
    const label = chalk.hex(colors.primary).bold(`Read ${String(total)} files`);
    const linesPart = dim(` · ${String(totalLines)} ${totalLines === 1 ? 'line' : 'lines'}`);
    const failPart = failed > 0 ? chalk.hex(colors.error)(` · ${String(failed)} failed`) : '';
    return `${bullet}${label}${linesPart}${failPart}`;
  }

  private buildBodyLine(snap: ToolCallReadSnapshot, isLast: boolean): string {
    const colors = this.colors;
    const dim = chalk.dim;
    const branch = isLast ? '└─' : '├─';
    const path = snap.filePath ?? '';
    const pathPart = chalk.hex(colors.text)(path);

    let tail: string;
    if (snap.phase === 'pending') {
      tail = dim(' · reading…');
    } else if (snap.phase === 'failed') {
      tail = chalk.hex(colors.error)(' · failed');
    } else {
      tail = dim(` · ${String(snap.lines)} ${snap.lines === 1 ? 'line' : 'lines'}`);
    }
    return `  ${branch} ${pathPart}${tail}`;
  }

  /** Releases throttle timers and snapshot listeners so destroyed components cannot refresh later. */
  dispose(): void {
    if (this.throttleTimer !== null) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    for (const e of this.entries) {
      e.unsubscribe?.();
      e.unsubscribe = undefined;
    }
  }
}
