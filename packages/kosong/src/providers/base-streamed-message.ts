/**
 * 每 provider `StreamedMessage` 实现的共享抽象基类。
 *
 * 持有字段四件套(`_id` / `_usage` / `_finishReason` / `_rawFinishReason`)
 * 与四个 getter——此前在四个适配器间复制粘贴的样板。子类拥有协议特定
 * 的流转换生成器,并实现 `_buildIter()`。
 *
 * 迭代器在首次迭代时惰性构建,使子类可在 `super()` 之后、生成器运行前
 * 初始化任何实例状态。
 *
 * 理由见 ADR 0015。
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
