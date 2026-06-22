import type { SkillActivatedEvent } from '@byfriends/sdk';

import type { TranscriptEntry } from '#/tui/types';
import { nextTranscriptId } from '#/tui/utils/transcript-id';

// ---------------------------------------------------------------------------
// State and callbacks for skill activation events
// ---------------------------------------------------------------------------

export interface SkillActivationState {
  renderedSkillActivationIds: Set<string>;
}

export interface SkillActivationCallbacks {
  appendTranscriptEntry(entry: TranscriptEntry): void;
}

// ---------------------------------------------------------------------------
// handleSkillActivated
// ---------------------------------------------------------------------------

export function handleSkillActivated(
  event: SkillActivatedEvent,
  state: SkillActivationState,
  callbacks: SkillActivationCallbacks,
): void {
  if (state.renderedSkillActivationIds.has(event.activationId)) return;
  state.renderedSkillActivationIds.add(event.activationId);
  callbacks.appendTranscriptEntry({
    id: nextTranscriptId(),
    kind: 'skill_activation',
    turnId: undefined,
    renderMode: 'plain',
    content: `Activated skill: ${event.skillName}`,
    skillActivationId: event.activationId,
    skillName: event.skillName,
    skillArgs: event.skillArgs,
  });
}
