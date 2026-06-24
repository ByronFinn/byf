/**
 * Shared abstract base for the per-provider `StreamedMessage` implementations.
 *
 * Holds the field quartet (`_id` / `_usage` / `_finishReason` /
 * `_rawFinishReason`) and the four getters — boilerplate that was previously
 * copy-pasted across the four adapters. Subclasses own the protocol-specific
 * stream-conversion generator and implement `_buildIter()`.
 *
 * The iterator is built lazily on first iteration so subclasses can initialize
 * any instance state after `super()` and before the generator runs.
 *
 * See ADR 0015 for the rationale.
 */

import type { StreamedMessagePart } from '#/message';
import type { FinishReason, StreamedMessage } from '#/provider';
import type { TokenUsage } from '#/usage';

export abstract class BaseStreamedMessage implements StreamedMessage {
  protected _id: string | null = null;
  protected _usage: TokenUsage | null = null;
  protected _finishReason: FinishReason | null = null;
  protected _rawFinishReason: string | null = null;
  private _iter: AsyncIterable<StreamedMessagePart> | undefined;

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
    this._iter ??= this._buildIter();
    yield* this._iter;
  }

  /**
   * Build the protocol-specific async iterable of message parts. The subclass
   * drives the provider's stream and populates `_id` / `_usage` /
   * `_finishReason` / `_rawFinishReason` as it runs.
   */
  protected abstract _buildIter(): AsyncIterable<StreamedMessagePart>;
}
