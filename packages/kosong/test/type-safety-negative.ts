/**
 * Negative type-safety checks.
 *
 * Each @ts-expect-error below marks code that MUST be rejected by tsc.
 * If tsc does NOT reject it, the @ts-expect-error itself becomes an error
 * ("Unused '@ts-expect-error' directive"), proving the type system has a gap.
 *
 * Run: bun x tsc --noEmit -p tsconfig.type-negative.json
 *
 * Scope note (PRD-0038): four earlier cases asserted that assigning `undefined`
 * to an *optional* property must be rejected. That requires
 * `exactOptionalPropertyTypes`, which this repository does not enable, so those
 * directives were self-inventing failures (unused directives) while nothing
 * executed this file. Turning the flag on surfaces a batch of legitimate
 * `optionalField: undefined` assignments across kosong's own src, so it is a real
 * decision rather than a config edit — and it is not paid for by quietly deleting
 * the assertion. What remains below is what the current compiler options
 * actually guarantee.
 */

import type { Message, StreamedMessagePart, TextPart } from '#/message';

// A required field cannot be satisfied by an explicit `undefined`.
const msg2: Message = {
  role: 'assistant',
  content: [],
  // @ts-expect-error — assigning undefined to a required field must be rejected
  toolCalls: undefined,
};

// Accessing a property from the wrong variant should fail.
const textPart: TextPart = { type: 'text', text: 'hello' };

// @ts-expect-error — TextPart does not have 'think' property
const _badAccess1: string = textPart.think;

// @ts-expect-error — TextPart does not have 'imageUrl' property
const _badAccess2: string = textPart.imageUrl;
const msg5: Message = {
  // @ts-expect-error — 'invalid' is not a valid Role
  role: 'invalid',
  content: [],
};
const badPart: StreamedMessagePart = {
  // @ts-expect-error — 'unknown_type' is not a valid part type
  type: 'unknown_type',
  text: 'hello',
};

// Suppress "unused variable" warnings — these variables exist only for type checking.
void msg2;
void _badAccess1;
void _badAccess2;
void msg5;
void badPart;
