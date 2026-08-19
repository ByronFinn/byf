/**
 * 单消费者异步队列。
 *
 * SSE 路由用一个队列把「事件产生（同步 onEvent 回调 / 心跳定时器）」与
 * 「流式写出（async stream.writeSSE）」解耦，保证帧按序写出、不并发交错。
 * 单 waiter：SSE 路由的读循环是唯一消费者。
 */
export class AsyncQueue<T> {
  private readonly buffer: T[] = [];
  private waiter: ((value: T | null) => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    if (this.waiter !== null) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(item);
    } else {
      this.buffer.push(item);
    }
  }

  /** 取下一条；队列被 `close()` 后 resolve `null`。 */
  async next(): Promise<T | null> {
    if (this.buffer.length > 0) {
      return this.buffer.shift() ?? null;
    }
    if (this.closed) return null;
    return new Promise<T | null>((resolve) => {
      this.waiter = resolve;
    });
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.waiter !== null) {
      const waiter = this.waiter;
      this.waiter = null;
      waiter(null);
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }
}
