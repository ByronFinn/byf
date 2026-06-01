import type { Component, Focusable, Terminal } from '@earendil-works/pi-tui';
import type { BackgroundTaskInfo } from '@byfriends/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksBrowserApp, type TasksBrowserProps } from '../../src/tui/components/dialogs/tasks-browser';
import { TasksBrowserController, type TasksBrowserEnv } from '../../src/tui/components/dialogs/tasks-browser/index';
import { darkColors } from '../../src/tui/theme/colors';

function task(overrides: Partial<BackgroundTaskInfo> = {}): BackgroundTaskInfo {
  return {
    taskId: 'bash-abcd1234',
    command: 'npm run dev',
    description: 'dev server',
    status: 'running',
    pid: 1234,
    exitCode: null,
    startedAt: Date.now() - 60_000,
    endedAt: null,
    ...overrides,
  };
}

function fakeTerminal(): Terminal {
  return {
    start: () => {},
    stop: () => {},
    drainInput: () => Promise.resolve(),
    write: () => {},
    get columns() { return 120; },
    get rows() { return 30; },
    get kittyProtocolActive() { return false; },
    moveBy: () => {},
    hideCursor: () => {},
    showCursor: () => {},
    clearLine: () => {},
    clearFromCursor: () => {},
    clearScreen: () => {},
    setTitle: () => {},
    setProgress: () => {},
  };
}

function makeEnv(overrides: Partial<TasksBrowserEnv> = {}): TasksBrowserEnv & {
  tasks: BackgroundTaskInfo[];
  errors: string[];
  swappedComponents: Array<Component & Focusable>;
  restoredChildren: Component[][];
  focusedComponents: Array<Component & Focusable>;
  renders: number;
} {
  const tasks: BackgroundTaskInfo[] = [];
  const errors: string[] = [];
  const swappedComponents: Array<Component & Focusable> = [];
  const restoredChildren: Component[][] = [];
  const focusedComponents: Array<Component & Focusable> = [];

  return {
    tasks,
    errors,
    swappedComponents,
    restoredChildren,
    focusedComponents,
    renders: 0,
    getTerminal: () => fakeTerminal(),
    getColors: () => darkColors,
    getBackgroundTasks() { return tasks.values(); },
    async listBackgroundTasks() { return tasks; },
    async getBackgroundTaskOutput(taskId: string, _opts?: { tail?: number }) {
      const t = tasks.find((x) => x.taskId === taskId);
      return t ? `output of ${taskId}` : '';
    },
    async stopBackgroundTask(_taskId: string, _opts: { reason: string }) {},
    getBackgroundTaskInfo(taskId: string) {
      return tasks.find((x) => x.taskId === taskId);
    },
    swapChildren(component: Component & Focusable): readonly Component[] {
      swappedComponents.push(component);
      return [];
    },
    restoreChildren(savedChildren: readonly Component[]) {
      restoredChildren.push([...savedChildren]);
    },
    setFocus(component: Component & Focusable) {
      focusedComponents.push(component);
    },
    requestRender(_full?: boolean) {
      this.renders++;
    },
    showError(message: string) {
      errors.push(message);
    },
    ...overrides,
  };
}

function spySetProps(app: TasksBrowserApp) {
  return vi.spyOn(app, 'setProps');
}

function lastProps(spy: ReturnType<typeof spySetProps>): TasksBrowserProps {
  const call = spy.mock.calls.at(-1);
  return call?.[0] as TasksBrowserProps;
}

describe('TasksBrowserController', () => {
  it('opens the browser and swaps children', async () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);

    await controller.show();

    expect(controller.isOpen).toBe(true);
    expect(env.swappedComponents).toHaveLength(1);
  });

  it('does not open if already open', async () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);

    await controller.show();
    await controller.show();

    expect(env.swappedComponents).toHaveLength(1);
  });

  it('shows error when listBackgroundTasks fails', async () => {
    const env = makeEnv({
      listBackgroundTasks: async () => { throw new Error('network'); },
    });
    const controller = new TasksBrowserController(env);

    await controller.show();

    expect(controller.isOpen).toBe(false);
    expect(env.errors).toContain('Failed to load tasks: network');
  });

  it('closes and restores children', async () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);

    await controller.show();
    expect(controller.isOpen).toBe(true);

    controller.close();
    expect(controller.isOpen).toBe(false);
    expect(env.restoredChildren).toHaveLength(1);
  });

  it('close is a no-op when not open', () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);
    controller.close();
    expect(controller.isOpen).toBe(false);
  });

  it('repaint pushes current background tasks to component', async () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);

    env.tasks.push(task({ taskId: 'bash-aaa' }));
    await controller.show();

    env.tasks.push(task({ taskId: 'bash-bbb' }));
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);
    controller.repaint();

    expect(spy).toHaveBeenCalled();
    expect(lastProps(spy).tasks).toHaveLength(2);
  });

  it('repaint is a no-op when browser is closed', () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);
    controller.repaint(); // should not throw
  });

  it('picks the first running task as initial selection', async () => {
    const env = makeEnv();
    env.tasks.push(
      task({ taskId: 'bash-completed', status: 'completed' }),
      task({ taskId: 'bash-running', status: 'running' }),
    );
    const controller = new TasksBrowserController(env);

    await controller.show();

    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);
    controller.repaint();
    expect(lastProps(spy).selectedTaskId).toBe('bash-running');
  });

  it('returns undefined initial selection when no tasks', async () => {
    const env = makeEnv();
    const controller = new TasksBrowserController(env);

    await controller.show();

    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);
    controller.repaint();
    expect(lastProps(spy).selectedTaskId).toBeUndefined();
  });

  it('handles race: state set while awaiting tasks', async () => {
    let resolveList: (tasks: BackgroundTaskInfo[]) => void;
    const listPromise = new Promise<readonly BackgroundTaskInfo[]>((resolve) => {
      resolveList = resolve;
    });
    const env = makeEnv({ listBackgroundTasks: () => listPromise });
    const controller = new TasksBrowserController(env);

    const showPromise = controller.show();
    resolveList!([task()]);
    await showPromise;
    expect(controller.isOpen).toBe(true);
  });

  it('calls stopBackgroundTask when stop confirmed', async () => {
    const stopFn = vi.fn();
    const env = makeEnv({
      stopBackgroundTask: stopFn,
    });
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);
    controller.repaint();

    const onStopConfirmed = lastProps(spy)['onStopConfirmed'] as (taskId: string) => void;

    await onStopConfirmed('bash-aaa');
    expect(stopFn).toHaveBeenCalledWith('bash-aaa', { reason: 'stopped from /tasks' });
  });

  it('opens output viewer and swaps children', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;

    const spy = spySetProps(comp);
    controller.repaint();
    const onOpenOutput = lastProps(spy)['onOpenOutput'] as (taskId: string) => void;

    await onOpenOutput('bash-aaa');

    expect(env.swappedComponents.length).toBeGreaterThanOrEqual(2);
  });

  it('does not open viewer if already viewing', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;

    const spy = spySetProps(comp);
    controller.repaint();
    const onOpenOutput = lastProps(spy)['onOpenOutput'] as (taskId: string) => void;

    await onOpenOutput('bash-aaa');
    const countAfterFirst = env.swappedComponents.length;
    await onOpenOutput('bash-aaa');

    expect(env.swappedComponents).toHaveLength(countAfterFirst);
  });

  it('closes viewer and restores browser children', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;

    const spy = spySetProps(comp);
    controller.repaint();
    const onOpenOutput = lastProps(spy)['onOpenOutput'] as (taskId: string) => void;

    await onOpenOutput('bash-aaa');

    controller.close();
    expect(controller.isOpen).toBe(false);
  });

  it('toggles filter between all and active', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onToggleFilter = lastProps(spy)['onToggleFilter'] as () => void;

    onToggleFilter();

    expect(lastProps(spy)['filter']).toBe('active');

    onToggleFilter();
    expect(lastProps(spy)['filter']).toBe('all');
  });

  it('select changes selectedTaskId and loads tail', async () => {
    const getOutputSpy = vi.fn().mockResolvedValue('some output');
    const env = makeEnv({ getBackgroundTaskOutput: getOutputSpy });
    env.tasks.push(
      task({ taskId: 'bash-aaa', status: 'running' }),
      task({ taskId: 'bash-bbb', status: 'running' }),
    );
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onSelect = lastProps(spy)['onSelect'] as (taskId: string) => void;

    onSelect('bash-bbb');

    expect(lastProps(spy)['selectedTaskId']).toBe('bash-bbb');
    expect(getOutputSpy).toHaveBeenCalledWith('bash-bbb', { tail: 4000 });
  });

  it('select is no-op when already selected', async () => {
    const getOutputSpy = vi.fn().mockResolvedValue('output');
    const env = makeEnv({ getBackgroundTaskOutput: getOutputSpy });
    env.tasks.push(task({ taskId: 'bash-aaa', status: 'running' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    await vi.waitFor(() => expect(getOutputSpy).toHaveBeenCalled());
    getOutputSpy.mockClear();

    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);
    controller.repaint();
    const onSelect = lastProps(spy)['onSelect'] as (taskId: string) => void;

    onSelect('bash-aaa'); // already selected
    expect(getOutputSpy).not.toHaveBeenCalledWith('bash-aaa', { tail: 4000 });
  });

  it('onCancel closes the browser', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onCancel = lastProps(spy)['onCancel'] as () => void;

    onCancel();
    expect(controller.isOpen).toBe(false);
  });

  it('onStopIgnored flashes message for terminal tasks', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa', status: 'completed' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onStopIgnored = lastProps(spy)['onStopIgnored'] as (taskId: string, reason: 'terminal') => void;

    onStopIgnored('bash-aaa', 'terminal');

    expect(lastProps(spy)['flashMessage']).toContain('already terminal');
  });

  it('handles getBackgroundTaskOutput failure in loadTail', async () => {
    const env = makeEnv({
      getBackgroundTaskOutput: async () => { throw new Error('fail'); },
    });
    env.tasks.push(
      task({ taskId: 'bash-aaa', status: 'running' }),
      task({ taskId: 'bash-bbb', status: 'running' }),
    );
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onSelect = lastProps(spy)['onSelect'] as (taskId: string) => void;

    onSelect('bash-bbb');

    await vi.waitFor(() => {
      expect(lastProps(spy)['tailLoading']).toBe(false);
    });
  });

  it('handleOpenOutput flashes error on failure', async () => {
    const env = makeEnv({
      getBackgroundTaskOutput: async () => { throw new Error('nope'); },
    });
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onOpenOutput = lastProps(spy)['onOpenOutput'] as (taskId: string) => void;

    await onOpenOutput('bash-aaa');

    expect(lastProps(spy)['flashMessage']).toContain('Cannot open output');
  });

  it('handleStop flashes error on failure', async () => {
    const env = makeEnv({
      stopBackgroundTask: async () => { throw new Error('denied'); },
    });
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onStopConfirmed = lastProps(spy)['onStopConfirmed'] as (taskId: string) => void;

    await onStopConfirmed('bash-aaa');

    expect(lastProps(spy)['flashMessage']).toContain('Stop failed');
  });

  it('closes viewer when closing browser', async () => {
    const env = makeEnv();
    env.tasks.push(task({ taskId: 'bash-aaa' }));
    const controller = new TasksBrowserController(env);

    await controller.show();
    const comp = env.swappedComponents[0]! as TasksBrowserApp;
    const spy = spySetProps(comp);

    controller.repaint();
    const onOpenOutput = lastProps(spy)['onOpenOutput'] as (taskId: string) => void;

    await onOpenOutput('bash-aaa');
    expect(env.swappedComponents.length).toBeGreaterThanOrEqual(2);

    controller.close();
    expect(controller.isOpen).toBe(false);
  });
});
