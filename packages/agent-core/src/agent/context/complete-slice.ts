import type { Message } from '@byfriends/kosong';

export function sliceCompleteMessages(
  messages: readonly Message[],
  requestedEnd: number,
): number {
  let normalized = Math.max(0, Math.min(messages.length, requestedEnd));

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role !== 'assistant' || message.toolCalls.length === 0) continue;

    const end = findToolExchangeEnd(messages, i);
    if (end === undefined) {
      if (normalized > i) {
        normalized = includePromptForAssistant(messages, i);
      }
      continue;
    }

    if (normalized > i && normalized < end) {
      normalized = includePromptForAssistant(messages, i);
    }
  }

  return normalized;
}

function findToolExchangeEnd(
  messages: readonly Message[],
  assistantIndex: number,
): number | undefined {
  const assistant = messages[assistantIndex];
  if (assistant?.role !== 'assistant') return undefined;

  const pending = new Set(assistant.toolCalls.map((call) => call.id));
  if (pending.size === 0) return assistantIndex + 1;

  for (let i = assistantIndex + 1; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.role !== 'tool') return undefined;
    if (message.toolCallId !== undefined) {
      pending.delete(message.toolCallId);
    }
    if (pending.size === 0) return i + 1;
  }

  return undefined;
}

function includePromptForAssistant(messages: readonly Message[], assistantIndex: number): number {
  const previous = messages[assistantIndex - 1];
  if (previous?.role === 'user') return assistantIndex - 1;
  return assistantIndex;
}
