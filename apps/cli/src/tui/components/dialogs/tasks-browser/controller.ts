import type { Component, Focusable, Terminal } from '@earendil-works/pi-tui';
import type { BackgroundTaskInfo } from '@byfriends/sdk';

import { TaskOutputViewer } from '../task-output-viewer';
import { TasksBrowserApp, type TasksFilter } from '../tasks-browser';
import type { ColorPalette } from '../../../theme/colors';

export interface TasksBrowserEnv {
  getTerminal(): Terminal;
  getColors(): ColorPalette;
  getBackgroundTasks(): IterableIterator<BackgroundTaskInfo>;
  listBackgroundTasks(): Promise<readonly BackgroundTaskInfo[]>;
  getBackgroundTaskOutput(taskId: string, opts?: { tail?: number }): Promise<string>;
  stopBackgroundTask(taskId: string, opts: { reason: string }): Promise<void>;
  getBackgroundTaskInfo(taskId: string): BackgroundTaskInfo | undefined;
  swapChildren(component: Component & Focusable): readonly Component[];
  restoreChildren(savedChildren: readonly Component[]): void;
  setFocus(component: Component & Focusable): void;
  requestRender(full?: boolean): void;
  showError(message: string): void;
}

interface ViewerState {
  component: TaskOutputViewer;
  savedChildren: readonly Component[];
  taskId: string;
  output: string;
  refreshId: number;
  pollTimer: NodeJS.Timeout;
}

interface BrowserState {
  component: TasksBrowserApp;
  savedChildren: readonly Component[];
  filter: TasksFilter;
  selectedTaskId: string | undefined;
  tailOutput: string | undefined;
  tailLoading: boolean;
  tailRequestId: number;
  flashMessage: string | undefined;
  flashTimer: NodeJS.Timeout | undefined;
  pollTimer: NodeJS.Timeout | undefined;
  viewer: ViewerState | undefined;
}

export class TasksBrowserController {
  private state: BrowserState | undefined;

  constructor(private readonly env: TasksBrowserEnv) {}

  get isOpen(): boolean {
    return this.state !== undefined;
  }

  async show(): Promise<void> {
    if (this.state !== undefined) return;

    let tasks: readonly BackgroundTaskInfo[];
    try {
      tasks = await this.env.listBackgroundTasks();
    } catch (error) {
      this.env.showError(
        `Failed to load tasks: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    if (this.state !== undefined) return;

    const filter: TasksFilter = 'all';
    const selectedTaskId = this.pickInitialSelection(tasks, filter);
    const component = new TasksBrowserApp(
      {
        tasks,
        filter,
        selectedTaskId,
        tailOutput: undefined,
        tailLoading: false,
        flashMessage: undefined,
        colors: this.env.getColors(),
        ...this.buildCallbacks(),
      },
      this.env.getTerminal(),
    );

    const savedChildren = this.env.swapChildren(component);

    const pollTimer = setInterval(() => {
      void this.refresh({ silent: true });
    }, 1000);

    this.state = {
      component,
      savedChildren,
      filter,
      selectedTaskId,
      tailOutput: undefined,
      tailLoading: false,
      tailRequestId: 0,
      flashMessage: undefined,
      flashTimer: undefined,
      pollTimer,
      viewer: undefined,
    };

    if (selectedTaskId !== undefined) {
      this.loadTail(selectedTaskId);
    }
  }

  close(): void {
    const browser = this.state;
    if (browser === undefined) return;
    if (browser.viewer !== undefined) this.closeViewer();
    if (browser.pollTimer !== undefined) clearInterval(browser.pollTimer);
    if (browser.flashTimer !== undefined) clearTimeout(browser.flashTimer);

    this.env.restoreChildren(browser.savedChildren);
    this.state = undefined;
  }

  repaint(): void {
    if (this.state === undefined) return;
    const tasks = [...this.env.getBackgroundTasks()];
    this.pushProps(tasks);
  }

  private async refresh(opts: { silent?: boolean } = {}): Promise<void> {
    const browser = this.state;
    if (browser === undefined) return;

    let tasks: readonly BackgroundTaskInfo[];
    try {
      tasks = await this.env.listBackgroundTasks();
    } catch (error) {
      if (!opts.silent) {
        this.flash(
          `Refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return;
    }
    if (this.state !== browser) return;
    this.pushProps(tasks);
  }

  private pushProps(tasks: readonly BackgroundTaskInfo[]): void {
    const browser = this.state;
    if (browser === undefined) return;
    browser.component.setProps({
      tasks,
      filter: browser.filter,
      selectedTaskId: browser.selectedTaskId,
      tailOutput: browser.tailOutput,
      tailLoading: browser.tailLoading,
      flashMessage: browser.flashMessage,
      colors: this.env.getColors(),
      ...this.buildCallbacks(),
    });
    this.env.requestRender();
  }

  private buildCallbacks() {
    return {
      onSelect: (taskId: string) => this.handleSelect(taskId),
      onToggleFilter: () => this.handleToggleFilter(),
      onRefresh: () => this.handleRefresh(),
      onCancel: () => this.close(),
      onStopConfirmed: (taskId: string) => void this.handleStop(taskId),
      onOpenOutput: (taskId: string) => void this.handleOpenOutput(taskId),
      onStopIgnored: (taskId: string, reason: 'terminal') => {
        if (reason === 'terminal') {
          this.flash(`${taskId} is already terminal — nothing to stop.`);
        }
      },
    };
  }

  private handleSelect(taskId: string): void {
    const browser = this.state;
    if (browser === undefined) return;
    if (browser.selectedTaskId === taskId) return;
    browser.selectedTaskId = taskId;
    browser.tailOutput = undefined;
    browser.tailLoading = true;
    this.repaint();
    this.loadTail(taskId);
  }

  private handleToggleFilter(): void {
    const browser = this.state;
    if (browser === undefined) return;
    browser.filter = browser.filter === 'all' ? 'active' : 'all';
    this.repaint();
  }

  private handleRefresh(): void {
    this.flash('Refreshing…', 600);
    void this.refresh();
  }

  private loadTail(taskId: string): void {
    const browser = this.state;
    if (browser === undefined) return;
    const requestId = ++browser.tailRequestId;
    void this.env
      .getBackgroundTaskOutput(taskId, { tail: 4000 })
      .then((output) => {
        const current = this.state;
        if (current === undefined) return;
        if (current !== browser || current.tailRequestId !== requestId) return;
        if (current.selectedTaskId !== taskId) return;
        current.tailOutput = output;
        current.tailLoading = false;
        this.repaint();
      })
      .catch(() => {
        const current = this.state;
        if (current === undefined) return;
        if (current !== browser || current.tailRequestId !== requestId) return;
        if (current.selectedTaskId !== taskId) return;
        current.tailOutput = '';
        current.tailLoading = false;
        this.repaint();
      });
  }

  private flash(message: string, durationMs = 2500): void {
    const browser = this.state;
    if (browser === undefined) return;
    if (browser.flashTimer !== undefined) clearTimeout(browser.flashTimer);
    browser.flashMessage = message;
    browser.flashTimer = setTimeout(() => {
      const current = this.state;
      if (current === undefined || current !== browser) return;
      current.flashMessage = undefined;
      current.flashTimer = undefined;
      this.repaint();
    }, durationMs);
    this.repaint();
  }

  private async handleStop(taskId: string): Promise<void> {
    const browser = this.state;
    if (browser === undefined) return;
    this.flash(`Stopping ${taskId}…`, 1500);
    try {
      await this.env.stopBackgroundTask(taskId, { reason: 'stopped from /tasks' });
      await this.refresh({ silent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.flash(`Stop failed: ${message}`);
    }
  }

  private async handleOpenOutput(taskId: string): Promise<void> {
    const browser = this.state;
    if (browser === undefined) return;
    if (browser.viewer !== undefined) return;

    let output: string;
    try {
      output = await this.env.getBackgroundTaskOutput(taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.flash(`Cannot open output: ${message}`);
      return;
    }
    const current = this.state;
    if (current === undefined || current !== browser) return;

    const info = this.env.getBackgroundTaskInfo(taskId);
    const viewer = new TaskOutputViewer(
      {
        taskId,
        info,
        output,
        colors: this.env.getColors(),
        onClose: () => this.closeViewer(),
      },
      this.env.getTerminal(),
    );

    const savedChildren = this.env.swapChildren(viewer);

    const pollTimer = setInterval(() => {
      void this.refreshViewer({ silent: true });
    }, 1000);

    browser.viewer = {
      component: viewer,
      savedChildren,
      taskId,
      output,
      refreshId: 0,
      pollTimer,
    };
  }

  private async refreshViewer(opts: { silent?: boolean } = {}): Promise<void> {
    const viewer = this.state?.viewer;
    if (viewer === undefined) return;

    const myRefreshId = ++viewer.refreshId;
    let output: string;
    try {
      output = await this.env.getBackgroundTaskOutput(viewer.taskId);
    } catch (error) {
      if (!opts.silent) {
        const message = error instanceof Error ? error.message : String(error);
        this.flash(`Output refresh failed: ${message}`);
      }
      return;
    }
    const current = this.state?.viewer;
    if (current === undefined || current !== viewer || current.refreshId !== myRefreshId) return;
    if (output === viewer.output) return;
    viewer.output = output;
    const info = this.env.getBackgroundTaskInfo(viewer.taskId);
    viewer.component.setProps({
      taskId: viewer.taskId,
      info,
      output,
      colors: this.env.getColors(),
      onClose: () => this.closeViewer(),
    });
    this.env.requestRender();
  }

  private closeViewer(): void {
    const browser = this.state;
    if (browser === undefined || browser.viewer === undefined) return;
    const viewer = browser.viewer;
    clearInterval(viewer.pollTimer);
    browser.viewer = undefined;
    this.env.restoreChildren(viewer.savedChildren);
    this.env.setFocus(browser.component);
    this.env.requestRender(true);
  }

  private pickInitialSelection(
    tasks: readonly BackgroundTaskInfo[],
    filter: TasksFilter,
  ): string | undefined {
    const candidates =
      filter === 'all'
        ? tasks
        : tasks.filter(
            (t) =>
              t.status !== 'completed' &&
              t.status !== 'failed' &&
              t.status !== 'killed' &&
              t.status !== 'lost',
          );
    if (candidates.length === 0) return undefined;
    return (
      candidates.find(
        (t) => t.status === 'running' || t.status === 'awaiting_approval',
      )?.taskId ?? candidates[0]!.taskId
    );
  }
}
