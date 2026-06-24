import type { SkillActivatedEvent } from '@byfriends/sdk';
import { describe, expect, it } from 'vitest';

import {
  handleSkillActivated,
  type SkillActivationCallbacks,
  type SkillActivationState,
} from '#/tui/events/skill-activation-handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<SkillActivationState> = {}): SkillActivationState {
  return {
    renderedSkillActivationIds: new Set(),
    ...overrides,
  };
}

type CallbackCalls = {
  appendTranscriptEntry: Parameters<SkillActivationCallbacks['appendTranscriptEntry']>[0][];
};

function makeCallbacks(): { callbacks: SkillActivationCallbacks; calls: CallbackCalls } {
  const calls: CallbackCalls = {
    appendTranscriptEntry: [],
  };
  const callbacks: SkillActivationCallbacks = {
    appendTranscriptEntry: (entry) => calls.appendTranscriptEntry.push(entry),
  };
  return { callbacks, calls };
}

// ---------------------------------------------------------------------------
// Event factory
// ---------------------------------------------------------------------------

function skillActivatedEvent(overrides: Partial<SkillActivatedEvent> = {}): SkillActivatedEvent {
  return {
    type: 'skill.activated',
    activationId: 'activation-1',
    skillName: 'review',
    skillArgs: '--verbose',
    ...overrides,
  } as SkillActivatedEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSkillActivated', () => {
  // =========================================================================
  // First activation
  // =========================================================================

  describe('first activation', () => {
    it('appends a skill_activation transcript entry with event data', () => {
      const state = makeState();
      const { callbacks, calls } = makeCallbacks();
      const event = skillActivatedEvent({
        activationId: 'activation-1',
        skillName: 'review',
        skillArgs: '--verbose',
      });

      handleSkillActivated(event, state, callbacks);

      expect(calls.appendTranscriptEntry).toHaveLength(1);
      const entry = calls.appendTranscriptEntry[0]!;
      expect(entry.kind).toBe('skill_activation');
      expect(entry.turnId).toBeUndefined();
      expect(entry.renderMode).toBe('plain');
      expect(entry.content).toBe('Activated skill: review');
      expect(entry.skillActivationId).toBe('activation-1');
      expect(entry.skillName).toBe('review');
      expect(entry.skillArgs).toBe('--verbose');
    });

    it('records the activationId in state to prevent duplicates', () => {
      const state = makeState();
      const { callbacks, calls } = makeCallbacks();

      handleSkillActivated(skillActivatedEvent({ activationId: 'activation-1' }), state, callbacks);
      expect(state.renderedSkillActivationIds.has('activation-1')).toBe(true);
      expect(calls.appendTranscriptEntry).toHaveLength(1);
    });

    it('handles skillName and skillArgs that are undefined or empty', () => {
      const state = makeState();
      const { callbacks, calls } = makeCallbacks();

      handleSkillActivated(
        skillActivatedEvent({ skillName: undefined, skillArgs: undefined }),
        state,
        callbacks,
      );

      expect(calls.appendTranscriptEntry).toHaveLength(1);
      const entry = calls.appendTranscriptEntry[0]!;
      expect(entry.content).toBe('Activated skill: undefined');
      expect(entry.skillName).toBeUndefined();
      expect(entry.skillArgs).toBeUndefined();
    });
  });

  // =========================================================================
  // Duplicate activation
  // =========================================================================

  describe('duplicate activation', () => {
    it('skips appending when activationId already exists in state', () => {
      const state = makeState({ renderedSkillActivationIds: new Set(['activation-1']) });
      const { callbacks, calls } = makeCallbacks();
      const event = skillActivatedEvent({ activationId: 'activation-1' });

      handleSkillActivated(event, state, callbacks);

      expect(calls.appendTranscriptEntry).toHaveLength(0);
    });

    it('does not modify state for duplicate activationIds', () => {
      const state = makeState({ renderedSkillActivationIds: new Set(['activation-1']) });
      const { callbacks } = makeCallbacks();

      handleSkillActivated(skillActivatedEvent({ activationId: 'activation-1' }), state, callbacks);

      expect(state.renderedSkillActivationIds.size).toBe(1);
    });
  });

  // =========================================================================
  // Multiple distinct activations
  // =========================================================================

  describe('multiple distinct activations', () => {
    it('appends entries for each unique activationId', () => {
      const state = makeState();
      const { callbacks, calls } = makeCallbacks();

      handleSkillActivated(
        skillActivatedEvent({ activationId: 'activation-1', skillName: 'review' }),
        state,
        callbacks,
      );
      handleSkillActivated(
        skillActivatedEvent({ activationId: 'activation-2', skillName: 'think' }),
        state,
        callbacks,
      );
      handleSkillActivated(
        skillActivatedEvent({ activationId: 'activation-3', skillName: 'debug' }),
        state,
        callbacks,
      );

      expect(calls.appendTranscriptEntry).toHaveLength(3);
      expect(calls.appendTranscriptEntry[0]!.skillName).toBe('review');
      expect(calls.appendTranscriptEntry[1]!.skillName).toBe('think');
      expect(calls.appendTranscriptEntry[2]!.skillName).toBe('debug');
      expect(state.renderedSkillActivationIds.size).toBe(3);
    });

    it('skips duplicate but allows subsequent unique activations', () => {
      const state = makeState();
      const { callbacks, calls } = makeCallbacks();

      handleSkillActivated(skillActivatedEvent({ activationId: 'a' }), state, callbacks);
      handleSkillActivated(skillActivatedEvent({ activationId: 'a' }), state, callbacks); // duplicate
      handleSkillActivated(skillActivatedEvent({ activationId: 'b' }), state, callbacks); // unique

      expect(calls.appendTranscriptEntry).toHaveLength(2);
      expect(state.renderedSkillActivationIds.size).toBe(2);
    });
  });
});
