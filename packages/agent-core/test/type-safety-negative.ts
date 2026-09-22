/**
 * Negative type-safety checks for the harness lane / event surface.
 *
 * Each `@ts-expect-error` below marks code that MUST be rejected by tsc. If the
 * compiler stops rejecting it, the directive itself becomes an error
 * ("Unused '@ts-expect-error' directive"), which is how this file catches a
 * type that has quietly stopped checking anything.
 *
 * Why this file exists (PRD-0038 review F1, on 941a131). `Omit<A | B, K>` is not
 * distributive: it first flattens the union down to its common keys and only then
 * removes K. Two places in the harness hit that trap, and both were held up by a
 * cast, so the symptom was "the type checks nothing" rather than a compile error:
 *
 *   - `LaneView.append` took `Omit<AppendEntryInput, 'laneId'>`, which collapses
 *     to `{ kind }` plus the optional pre-allocated `id` — so no payload-bearing
 *     *literal* could be passed (excess-property check), and callers worked around
 *     it by hoisting the object into a variable, where the check does not run.
 *   - `V2EventBus.emit` took `Omit<V2Event, 'laneId' | 'seq' | 'at'>`, which
 *     collapses to `{ type, recovery }` — every one of the ~30 emit call sites
 *     stopped having its payload fields checked. Removing the flattening is what
 *     surfaced that `run_end` had never declared `'suspended'`.
 *
 * Everything asserted here is compile-time only, so `bun test` cannot see it. Run
 * it with:
 *
 *   bun x tsc --noEmit -p packages/agent-core/tsconfig.type-negative.json
 *
 * (wired into `bun run typecheck:negative`, next to kosong's identical project).
 */

import type { OperationOutcome } from '#/harness/agent-harness';
import type { RunOutcome, V2Event, V2EventBus } from '#/harness/events';
import type { LaneView } from '#/harness/session/session';
import type { AppendEntryInput, StoredMessage } from '#/harness/storage/types';

// ===== derived from the real signatures, never hand-copied =====

type EmitBuild = Parameters<V2EventBus['emit']>[1];
type EmitBase = Parameters<EmitBuild>[0];
type EmitPayload = ReturnType<EmitBuild>;

// ===== (i) a payload-bearing literal must be ACCEPTED by lane.append =====
//
// Positive half of the pair. Under the old flattened `Omit` every line below is
// rejected by the excess-property check, so if anyone reintroduces it these
// "must compile" assertions are what turn the project red.

declare const lane: LaneView;

const storedMessage: StoredMessage = {
  role: 'user',
  content: [{ type: 'text', text: 'hi' }],
};

void lane.append({ kind: 'message', message: storedMessage });
void lane.append({ kind: 'model_change', modelAlias: 'gpt' });
void lane.append({ kind: 'thinking_level_change', thinkingLevel: 'high' });
void lane.append({ kind: 'active_tools_change', activeTools: ['Read'] });
void lane.append({ kind: 'compaction', summary: 's', compactedUpTo: 'e1' });
void lane.append({ kind: 'branch_summary', summary: 's' });
void lane.append({ kind: 'custom', customType: 'goal.set', data: { round: 1 } });
// the optional pre-allocated id survives the omit too (PRD-0037 意图先行)
void lane.append({ id: 'entry:op:input', kind: 'branch_summary', summary: 's' });

// ===== (ii) a missing or misplaced payload must be REJECTED =====

// @ts-expect-error — 'message' without its `message` payload must not compile
void lane.append({ kind: 'message' });

// @ts-expect-error — 'model_change' without `modelAlias` must not compile
void lane.append({ kind: 'model_change' });

// @ts-expect-error — cross-variant payload leak: `message` is not a model_change field
void lane.append({ kind: 'model_change', message: storedMessage });

// @ts-expect-error — the payload type is checked, not merely its presence
void lane.append({ kind: 'model_change', modelAlias: 42 });

// @ts-expect-error — `laneId` belongs to the lane view, not to the caller
void lane.append({ laneId: 'main', kind: 'model_change', modelAlias: 'gpt' });

// @ts-expect-error — an unknown entry kind must not compile
void lane.append({ kind: 'not_a_kind', summary: 's' });

// ===== (iii) an emit builder must be ACCEPTED without the envelope =====
//
// `laneId` / `seq` / `at` are emit's job, so a builder is *not* required to name
// them — and the payload it does name is checked variant-by-variant.

declare const bus: V2EventBus;

bus.emit('main', () => ({ type: 'run_end', opId: 'op-1', outcome: 'suspended' }));
bus.emit('main', () => ({ type: 'run_start', opId: 'op-1' }));
bus.emit('main', () => ({ type: 'tool_end', toolCallId: 'tc', name: 'bash', isError: true }));
bus.emit('main', () => ({ type: 'run_end', opId: 'op-1', outcome: 'failed' }), {
  recovery: true,
});
// builders that spread `base` (as the harness does) stay valid: the envelope is
// not part of the declared payload, but spreading is not an excess property.
bus.emit('main', (base) => ({ ...base, type: 'lane_change', detail: 'create' }));

// @ts-expect-error — run_end must carry `outcome`; the flattening hid exactly this
bus.emit('main', () => ({ type: 'run_end', opId: 'op-1' }));

// @ts-expect-error — the payload field's type is checked, not just its presence
bus.emit('main', () => ({ type: 'run_end', opId: 'op-1', outcome: 42 }));

// @ts-expect-error — a made-up terminal state must not compile
bus.emit('main', () => ({ type: 'run_end', opId: 'op-1', outcome: 'cancelled' }));

// @ts-expect-error — message events need their own payload, not just a `role`
bus.emit('main', () => ({ type: 'message', role: 'user' }));

// @ts-expect-error — tool_start declares `name` as required
bus.emit('main', () => ({ type: 'tool_start', toolCallId: 'tc' }));

// `RunOutcome` is one union shared by the event and the operation result. Revert
// either half to a hand-copied list and these lines are what catch the drift.
const runOutcomes: readonly RunOutcome[] = ['completed', 'aborted', 'failed', 'suspended'];
const operationOutcome: OperationOutcome['outcome'] = 'suspended';
const eventOutcome: Extract<V2Event, { type: 'run_end' }>['outcome'] = 'suspended';
void runOutcomes;
void operationOutcome;
void eventOutcome;
// @ts-expect-error — 'deferred' is a provider finish reason, not a run outcome
const badRunOutcome: RunOutcome = 'deferred';
void badRunOutcome;

// The envelope must be gone from what a builder may return, and `V2Event` must
// still demand it: `emit` cannot drop `at` and have the construction site typecheck
// (the pre-fix code only passed because the object was `as V2Event`-cast).
declare const payload: EmitPayload;
declare const base: EmitBase;
// @ts-expect-error — building a V2Event without `at` is a type error once the cast is gone
const missingEnvelope: V2Event = { ...payload, laneId: base.laneId, seq: base.seq };
void missingEnvelope;

// ===== (iv) the reversion guard: plain `Omit` must FAIL on (i) and (iii) =====
//
// A `(iv)` that only says "delete DistributiveOmit and watch this file go red"
// cannot be expressed as a static assertion — the file would have to contain both
// spellings at once. What can be pinned statically is the *mechanism*: the exact
// expressions accepted above must be rejected when the non-distributive `Omit`
// computes the same types. That is what these blocks assert, so a reversion of
// `DistributiveOmit` → `Omit` in storage/types.ts (or in `emit`'s signature) makes
// this project red in two independent ways: the positive lines in (i)/(iii) start
// erroring, and the directives below stop erroring.

type FlattenedAppendInput = Omit<AppendEntryInput, 'laneId'>;
declare function appendThroughFlattenedOmit(input: FlattenedAppendInput): void;

// @ts-expect-error — plain Omit collapses the union to its common keys, so `message`
// becomes an excess property: this is the defect 941a131 fixed.
appendThroughFlattenedOmit({ kind: 'message', message: storedMessage });

// @ts-expect-error — same collapse for a different variant
appendThroughFlattenedOmit({ kind: 'custom', customType: 'goal.set', data: null });

type FlattenedEmitPayload = Omit<V2Event, 'laneId' | 'seq' | 'at'>;
declare function emitThroughFlattenedOmit(build: (base: EmitBase) => FlattenedEmitPayload): void;

// Written in a variable-initialisation position on purpose: that is where the
// excess-property check definitely runs, and it is the same type `emit` consumes.
// (Each literal stays on one line: `@ts-expect-error` only covers the next line,
// and the excess-property diagnostic is reported on the offending property.)
const realPayloadLiteral: EmitPayload = { type: 'run_end', opId: 'o', outcome: 'completed' };
void realPayloadLiteral;
// @ts-expect-error — plain Omit collapses V2Event to its common keys, so `outcome` is
// not part of the type at all: the payload stops being checked. This is the defect
// 941a131 fixed in `emit`'s signature.
const flattenedPayloadLiteral: FlattenedEmitPayload = { type: 'run_end', outcome: 'x' };
void flattenedPayloadLiteral;
// @ts-expect-error — same collapse for `opId`, which run_start/run_end/step all require
const flattenedNoOpId: FlattenedEmitPayload = { type: 'run_start', opId: 'op-1' };
void flattenedNoOpId;

// The collapse also drops the requirement to say anything at all, which is what
// made the old parameter type useless rather than merely stricter-but-different:
// this builder is legal through the flattened signature and illegal through
// `bus.emit` (asserted by the missing-`outcome` case above).
emitThroughFlattenedOmit(() => ({ type: 'run_end' }));
const acceptsAnEmptyPayload: FlattenedEmitPayload = { type: 'run_end' };
void acceptsAnEmptyPayload;
// @ts-expect-error — the real payload type does require the variant's fields
const rejectsAnEmptyPayload: EmitPayload = { type: 'run_end' };
void rejectsAnEmptyPayload;
