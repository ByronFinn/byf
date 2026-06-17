/**
 * Shared abstract base for the per-provider `StreamedMessage` implementations.
 *
 * Holds the field quartet (`_id` / `_usage` / `_finishReason` /
 * `_rawFinishReason`), the backing `_iter`, `[Symbol.asyncIterator]`
 * forwarding, and the four getters — boilerplate that was previously
 * copy-pasted across the four adapters. Subclasses own the protocol-specific
 * stream-conversion generator and populate the fields as the stream progresses.
 *
 * See ADR 0015 for the rationale.
 */

import type { FinishReason, StreamedMessage } from '#/provider';
import type { StreamedMessagePart } from '#/message';
import type { TokenUsage } from '#/usage';

export abstract class BaseStreamedMessage implements StreamedMessage {
  protected _id: string | null = null;
  protected _usage: TokenUsage | null = null;
  protected _finishReason: FinishReason | null = null;
  protected _rawFinishReason: string | null = null;
  protected readonly _iter: AsyncIterable<StreamedMessagePart>;

  /**
   * @param iter The protocol-specific async iterable of message parts. The
   *   subclass constructs this (typically an async generator that drives the
   *   provider's stream and populates `_id` / `_usage` / `_finishReason` /
   *   `_rawFinishReason` as it runs).
   */
  constructor(iter: AsyncIterable<StreamedMessagePart>) {
    this._iter = iter;
  }

  get id(): string | null {
    return this._id;
  }

  get usage(): TokenUsage | null {
    return this._usage;
  }

  get finishReason(): FinishReason | null {
    return this._finishReason;
  }

  get rawFinishReason(): string | null {
    return this._rawFinishReason;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamedMessagePart> {
    yield* this._iter;
  }
}
