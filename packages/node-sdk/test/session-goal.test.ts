import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness, type ByfError, type Event, type GoalSnapshot } from '#/index';

import {
  makeTempDir,
  removeTempDirs,
  waitForAgentWireEvent,
  waitForSDKEvent,
} from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe('Session goal methods (PRD-0019 #203)', () => {
  it('createGoal writes goal.create on the wire and returns the active snapshot', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({
        id: 'ses_goal_create',
        workDir,
      });

      const snapshot = await session.createGoal('ship feature X');

      expect(snapshot?.status).toBe('active');
      expect(snapshot?.objective).toBe('ship feature X');

      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'goal.create',
          (event) => typeof event['objective'] === 'string',
        ),
      ).resolves.toMatchObject({
        type: 'goal.create',
        objective: 'ship feature X',
      });
    } finally {
      await harness.close();
    }
  });

  it('createGoal forwards budget and replace options', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_budget', workDir });

      await session.createGoal('first');
      await session.createGoal('second', {
        replace: true,
        budget: { turnBudget: 3, tokenBudget: 1000, wallClockBudgetMs: 60_000 },
      });

      // AC-5: replace must emit goal.clear (old) then goal.create (new) on the wire.
      const cleared = await waitForAgentWireEvent(homeDir, session.id, 'goal.clear');
      void cleared;
      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'goal.create',
          (event) => event['objective'] === 'second',
        ),
      ).resolves.toMatchObject({
        type: 'goal.create',
        objective: 'second',
        budget: { turnBudget: 3, tokenBudget: 1000, wallClockBudgetMs: 60_000 },
      });
    } finally {
      await harness.close();
    }
  });

  it('createGoal rejects GOAL_ALREADY_EXISTS without replace', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_exists', workDir });
      await session.createGoal('first');

      await expect(session.createGoal('second')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'goal.already_exists',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('getGoal returns the current snapshot', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_get', workDir });
      await session.createGoal('the objective');

      const snapshot = await session.getGoal();
      expect(snapshot?.objective).toBe('the objective');
      expect(snapshot?.status).toBe('active');
    } finally {
      await harness.close();
    }
  });

  it('pauseGoal / resumeGoal / cancelGoal each update the snapshot', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_lifecycle', workDir });
      await session.createGoal('obj');

      const paused = await session.pauseGoal();
      expect(paused?.status).toBe('paused');

      const resumed = await session.resumeGoal();
      expect(resumed?.status).toBe('active');

      const cancelled = await session.cancelGoal();
      expect(cancelled).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('emits goal.updated events that the host can subscribe to', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_events', workDir });

      const eventPromise = waitForSDKEvent(session, (event) => event.type === 'goal.updated');

      await session.createGoal('listen for the event');

      const event = (await eventPromise) as Extract<Event, { type: 'goal.updated' }>;
      expect(event.type).toBe('goal.updated');
      expect(event.snapshot?.status).toBe('active');
      expect(event.snapshot?.objective).toBe('listen for the event');
    } finally {
      await harness.close();
    }
  });

  it('emits goal.updated with null snapshot when the goal is cancelled', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_null', workDir });
      await session.createGoal('about to cancel');

      const nullPromise = waitForSDKEvent(
        session,
        (event) => event.type === 'goal.updated' && event.snapshot === null,
      );

      await session.cancelGoal();

      const event = (await nullPromise) as Extract<Event, { type: 'goal.updated' }>;
      expect(event.type).toBe('goal.updated');
      expect(event.snapshot).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('rejects after the session is closed', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-goal-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-goal-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_goal_closed', workDir });
      await session.close();

      await expect(session.createGoal('obj')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
      await expect(session.getGoal()).rejects.toMatchObject({ code: 'session.closed' });
      await expect(session.pauseGoal()).rejects.toMatchObject({ code: 'session.closed' });
      await expect(session.resumeGoal()).rejects.toMatchObject({ code: 'session.closed' });
      await expect(session.cancelGoal()).rejects.toMatchObject({ code: 'session.closed' });
    } finally {
      await harness.close();
    }
  });
});

describe('goal type re-exports', () => {
  it('GoalSnapshot and related types are importable from the SDK', async () => {
    // Compile-time check that the public re-exports resolve. The runtime
    // assertion is light — just confirm the type is reachable from #/index.
    const snapshot: GoalSnapshot | null = null;
    expect(snapshot).toBeNull();
  });
});
