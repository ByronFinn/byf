/**
 * Turn-level loop for a stateless agent run.
 *
 * Owns convergence across steps: abort checks at loop boundaries, max-step
 * enforcement, usage aggregation, optional continuation after non-tool stops,
 * and final `TurnResult` mapping. One-step execution lives in `turn-step.ts`.
 */

import { addUsage, emptyUsage, type TokenUsage } from '@byfriends/kosong';

import type { Logger } from '#/logging/types';

import {
  createMaxStepsExceededError,
  errorMessage,
  isAbortError,
  isMaxStepsExceededError,
} from './errors';
import type { LoopInterruptReason, LoopEventDispatcher, LoopTurnInterruptedEvent } from './events';
import type { LLM } from './llm';
import { executeLoopStep } from './turn-step';
import type {
  ExecutableTool,
  LoopHooks,
  LoopMessageBuilder,
  LoopTerminalStepStopReason,
  LoopTurnStopReason,
  TurnResult,
} from './types';

export interface RunTurnInput {
  readonly turnId: string;
  readonly signal: AbortSignal;
  readonly llm: LLM;
  readonly buildMessages: LoopMessageBuilder;
  readonly buildMessagesMediaDegraded?: LoopMessageBuilder;
  readonly buildMessagesMediaStripped?: LoopMessageBuilder;
  readonly dispatchEvent: LoopEventDispatcher;
  readonly tools?: readonly ExecutableTool[];
  readonly hooks?: LoopHooks;
  readonly log?: Logger;
  readonly maxSteps?: number;
  readonly maxRetryAttempts?: number;
}

export async function runTurn(input: RunTurnInput): Promise<TurnResult> {
  const {
    turnId,
    signal,
    llm,
    buildMessages,
    buildMessagesMediaDegraded,
    buildMessagesMediaStripped,
    dispatchEvent,
    tools,
    hooks,
    log,
    maxSteps,
    maxRetryAttempts,
  } = input;
  let usage: TokenUsage = emptyUsage();
  let steps = 0;
  // Normal exits overwrite this with the completed step's stop reason.
  let stopReason: LoopTurnStopReason = 'end_turn';
  let activeStep: number | undefined;
  // Sticky media projection: once a step only succeeded via a degraded or
  // stripped resend, later steps in the same turn keep using that projection
  // (avoids re-paying a rejection every step — the same media is re-sent).
  let mediaDegradedActive = false;
  let mediaStrippedActive = false;
  const recordStepUsage = (stepUsage: TokenUsage): void => {
    usage = addUsage(usage, stepUsage);
  };

  try {
    while (true) {
      signal.throwIfAborted();

      if (maxSteps !== undefined && steps >= maxSteps) {
        throw createMaxStepsExceededError(maxSteps);
      }

      steps += 1;
      activeStep = steps;
      // Pick the active projection for this step. Stripped takes priority
      // over degraded (a format rejection is stricter than a size rejection).
      const activeBuildMessages =
        mediaStrippedActive && buildMessagesMediaStripped !== undefined
          ? buildMessagesMediaStripped
          : mediaDegradedActive && buildMessagesMediaDegraded !== undefined
            ? buildMessagesMediaDegraded
            : buildMessages;
      const stepResult = await executeLoopStep({
        turnId,
        signal,
        buildMessages: activeBuildMessages,
        buildMessagesMediaDegraded: mediaDegradedActive ? undefined : buildMessagesMediaDegraded,
        buildMessagesMediaStripped: mediaStrippedActive ? undefined : buildMessagesMediaStripped,
        dispatchEvent,
        llm,
        tools,
        hooks,
        log,
        currentStep: steps,
        maxRetryAttempts,
        recordUsage: recordStepUsage,
      });
      // Latch the sticky projection: once degraded/stripped succeeds, it
      // stays active for the rest of the turn.
      if (stepResult.mediaDegradedResendUsed) mediaDegradedActive = true;
      if (stepResult.mediaStrippedResendUsed) mediaStrippedActive = true;
      activeStep = undefined;

      if (stepResult.stopReason === 'tool_use') {
        continue;
      }

      const terminalStopReason: LoopTerminalStepStopReason = stepResult.stopReason;
      stopReason = terminalStopReason;

      if (
        !(
          await hooks?.shouldContinueAfterStop?.({
            turnId,
            stepNumber: steps,
            usage: stepResult.usage,
            stopReason: terminalStopReason,
            signal,
            llm,
          })
        )?.continue
      ) {
        break;
      }
    }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      dispatchEvent(makeInterruptedEvent('aborted', steps, activeStep));
      return { stopReason: 'aborted', steps, usage };
    }
    const reason: LoopInterruptReason = isMaxStepsExceededError(error) ? 'max_steps' : 'error';
    dispatchEvent(makeInterruptedEvent(reason, steps, activeStep, errorMessage(error)));
    throw error;
  }

  return { stopReason, steps, usage };
}

function makeInterruptedEvent(
  reason: LoopInterruptReason,
  attemptedSteps: number,
  activeStep: number | undefined,
  message?: string,
): LoopTurnInterruptedEvent {
  return {
    type: 'turn.interrupted',
    reason,
    attemptedSteps,
    activeStep,
    message,
  };
}
