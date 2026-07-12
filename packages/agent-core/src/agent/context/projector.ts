import type { ContentPart, Message, TextPart } from '@byfriends/kosong';

import { renderNotificationXml } from './notification-xml';

type ProjectableMessage = Message & {
  readonly origin?:
    | {
        readonly kind: string;
        readonly event?: string;
        readonly blockedByHook?: string;
      }
    | undefined;
};

const TRANSCRIPT_ONLY_HOOK_RESULT_EVENTS = new Set(['UserPromptSubmit']);

export interface EphemeralInjection {
  kind: 'memory_recall' | 'system_reminder' | 'pending_notification';
  content: string | Record<string, unknown>;
  position?: 'before_user' | 'after_system';
}

export function project(
  history: readonly ProjectableMessage[],
  ephemeralInjections?: readonly EphemeralInjection[],
): Message[] {
  // Keep partial or empty assistant placeholders away from providers.
  // They can appear when a turn is aborted or errors before any content
  // or tool call is appended.
  const usable = history.filter((message) => {
    if (isBlockedUserPrompt(message)) return false;
    return (
      !isTranscriptOnlyHookResult(message) &&
      message.partial !== true &&
      !(
        message.role === 'assistant' &&
        message.content.length === 0 &&
        message.toolCalls.length === 0
      )
    );
  });
  const merged = mergeAdjacentUserMessages(usable);

  if (!ephemeralInjections?.length) return merged;

  // Split injections by position:
  // - 'after_system' (default): prepended before all history — these are
  //   part of the cached prefix and should be stable across steps.
  //   ⚠️ CAUTION: `after_system` injections shift all history indices.
  //   The cache-staking logic in `applyCacheStaking` uses indices derived
  //   from `context.messages` (which excludes ephemerals). If an
  //   `after_system` injector is ever added, cache staking will tag the
  //   wrong messages. Prefer `before_user` for all new injectors.
  // - 'before_user': appended after all history — these are dynamic,
  //   per-request content (timestamp, permission state) that must not
  //   break the cached prefix.
  const afterSystemMsgs = ephemeralInjections
    .filter((injection) => !injection.position || injection.position === 'after_system')
    .map((injection) => renderInjection(injection));
  const beforeUserMsgs = ephemeralInjections
    .filter((injection) => injection.position === 'before_user')
    .map((injection) => renderInjection(injection));

  return [...afterSystemMsgs, ...merged, ...beforeUserMsgs];
}

function isTranscriptOnlyHookResult(message: ProjectableMessage): boolean {
  return (
    message.origin?.kind === 'hook_result' &&
    TRANSCRIPT_ONLY_HOOK_RESULT_EVENTS.has(message.origin.event ?? '')
  );
}

function isBlockedUserPrompt(message: ProjectableMessage): boolean {
  return message.role === 'user' && message.origin?.blockedByHook === 'UserPromptSubmit';
}

/**
 * Render an EphemeralInjection into a synthetic user message. System
 * reminders and pending notifications use XML wrappers so the model can
 * distinguish host annotations from genuine user text. `memory_recall`
 * stays as free text.
 *
 * The merge-guard logic downstream (`mergeAdjacentUserMessages`) uses
 * the `<notification ` / `<system-reminder>` opening tag to detect
 * these messages, so the exact tag names are load-bearing for
 * projector correctness — do not rename without also updating
 * `isInjectionUserMessage` below.
 */
function renderInjection(injection: EphemeralInjection): Message {
  const text = renderInjectionText(injection);
  return {
    role: 'user',
    content: [{ type: 'text', text }],
    toolCalls: [],
  };
}

function renderInjectionText(injection: EphemeralInjection): string {
  const { kind, content } = injection;
  if (kind === 'pending_notification') {
    // Production callers pass notification metadata, but accepting a
    // string keeps older embedders from crashing on replay/projection.
    if (typeof content === 'string') {
      return `<notification>\n${content}\n</notification>`;
    }
    return renderNotificationXml(content);
  }
  if (kind === 'system_reminder') {
    const body = typeof content === 'string' ? content : JSON.stringify(content);
    return `<system-reminder>\n${body}\n</system-reminder>`;
  }
  const body = typeof content === 'string' ? content : JSON.stringify(content);
  return body;
}

/**
 * Detect whether a user message was produced by the ephemeral injection
 * pipeline (system_reminder or notification XML tag). Such messages
 * must never be merged with an adjacent real user turn — doing so would
 * smear the injection's XML wrapper into the user's actual prompt and
 * confuse the LLM about where the system annotation ends.
 *
 */
function isInjectionUserMessage(message: Message): boolean {
  if (message.role !== 'user') return false;
  const text = extractTextOnly(message);
  // Cheap leading-fragment check — injections always have the opening
  // tag at the start. We use `trimStart()` so leading whitespace
  // doesn't defeat the check, and require `'<notification '` (with
  // trailing space) so user text like `<notificationally` or the
  // bare `<notification>` tag (no attributes) is not misidentified.
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<notification ')) return true;
  if (trimmed.startsWith('<system-reminder>')) return true;
  if (trimmed.startsWith('<hook_result ')) return true;
  return false;
}

function mergeAdjacentUserMessages(history: readonly Message[]): Message[] {
  const out: Message[] = [];
  for (const message of history) {
    const previous = out.at(-1);
    if (
      message.role === 'user' &&
      previous !== undefined &&
      previous.role === 'user' &&
      !isInjectionUserMessage(message) &&
      !isInjectionUserMessage(previous)
    ) {
      out[out.length - 1] = mergeTwoUserMessages(previous, message);
      continue;
    }
    // Clone into a fresh Message so we never mutate input arrays.
    out.push(cloneMessage(message));
  }
  return out;
}

function mergeTwoUserMessages(a: Message, b: Message): Message {
  const aText = extractTextOnly(a);
  const bText = extractTextOnly(b);
  const nonTextParts = [
    ...a.content.filter((p) => p.type !== 'text'),
    ...b.content.filter((p) => p.type !== 'text'),
  ];
  const mergedText: TextPart = { type: 'text', text: `${aText}\n\n${bText}` };
  const content: ContentPart[] = [mergedText, ...nonTextParts];
  return {
    role: 'user',
    content,
    toolCalls: [],
  };
}

function extractTextOnly(message: Message): string {
  return message.content
    .filter((p): p is TextPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function cloneMessage(message: Message): Message {
  return {
    role: message.role,
    name: message.name,
    content: message.content.map((p) => ({ ...p })) as ContentPart[],
    toolCalls: message.toolCalls.map((tc) => ({ ...tc })),
    toolCallId: message.toolCallId,
    partial: message.partial,
  };
}

// ---------------------------------------------------------------------------
// Media-degraded / media-stripped projections (read-side transforms)
// ---------------------------------------------------------------------------

/**
 * How many of the most recent media parts survive the media-degraded
 * projection. The tail images are what the model is actively working from
 * (the screenshot it just took); everything older is replaced by a marker.
 */
export const MEDIA_DEGRADE_KEEP_RECENT = 2;

const MEDIA_DEGRADED_PLACEHOLDERS = {
  image_url:
    '[image omitted: dropped to fit the provider request size limit; re-read the file to view it]',
  audio_url:
    '[audio omitted: dropped to fit the provider request size limit; re-read the file to hear it]',
  video_url:
    '[video omitted: dropped to fit the provider request size limit; re-read the file to view it]',
} as const;

/**
 * Markers for the media-stripped resend after the provider rejected an
 * image's FORMAT (not its size): the image marker points the model at
 * re-reading the file, whose refusal carries per-OS conversion instructions;
 * audio/video are collateral of the full strip and say so.
 */
export const MEDIA_STRIPPED_PLACEHOLDERS = {
  image_url:
    '[image omitted: the provider rejected this image; re-read the file for conversion instructions]',
  audio_url: '[audio omitted: dropped along with a rejected image; re-read the file to hear it]',
  video_url: '[video omitted: dropped along with a rejected image; re-read the file to view it]',
} as const;

type MediaPlaceholderSet = typeof MEDIA_DEGRADED_PLACEHOLDERS | typeof MEDIA_STRIPPED_PLACEHOLDERS;

function isDegradableMediaPart(
  part: ContentPart,
): part is ContentPart & { type: keyof MediaPlaceholderSet } {
  return part.type in MEDIA_DEGRADED_PLACEHOLDERS;
}

/**
 * Replace all but the `keepRecent` most recent media parts with deterministic
 * text markers. This is the media-degraded projection used to resend a request
 * the provider rejected as too large (HTTP 413 on accumulated base64 media)
 * and — with `keepRecent = 0` and `MEDIA_STRIPPED_PLACEHOLDERS` — the resend
 * after an image-format rejection, where the poisoned image could be anywhere
 * and only a full strip guarantees a clean request. A purely read-side
 * transform — the underlying history is left untouched — that trades pixels
 * for deliverability while the surrounding text (including ReadMediaFile's
 * `<image path="...">` wrapper) survives, so the model can re-read any file
 * it still needs. Untouched messages are returned by reference, and when
 * nothing needs degrading the input array itself is returned.
 */
export function degradeOlderMediaParts(
  messages: readonly Message[],
  keepRecent: number,
  placeholders: MediaPlaceholderSet = MEDIA_DEGRADED_PLACEHOLDERS,
): Message[] {
  const mediaCount = messages.reduce(
    (count, message) => count + message.content.filter(isDegradableMediaPart).length,
    0,
  );
  let toDegrade = Math.max(0, mediaCount - keepRecent);
  if (toDegrade === 0) return messages as Message[];

  return messages.map((message) => {
    if (toDegrade === 0 || !message.content.some(isDegradableMediaPart)) return message;
    const content = message.content.map((part): ContentPart => {
      if (toDegrade === 0 || !isDegradableMediaPart(part)) return part;
      toDegrade -= 1;
      return { type: 'text', text: placeholders[part.type] };
    });
    return { ...message, content };
  });
}
