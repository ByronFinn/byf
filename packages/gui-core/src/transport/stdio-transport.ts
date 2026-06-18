import process from 'node:process';

import type { Transport } from './transport';

/**
 * Bounded tail buffer that keeps only the last `maxBytes` bytes.
 * Used for stderr capture to prevent unbounded memory growth.
 */
class BoundedTail {
  private buffer = '';
  constructor(private readonly maxBytes: number) {}

  append(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > this.maxBytes) {
      this.buffer = this.buffer.slice(-this.maxBytes);
    }
  }

  tail(): string {
    return this.buffer;
  }
}

export class StdioTransport implements Transport {
  private messageHandler: ((frame: string) => void) | null = null;
  private closed = false;
  private readonly stderrTail = new BoundedTail(4096);

  constructor() {
    process.stdin.setEncoding('utf-8');

    let buffer = '';
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      // Keep the last potentially-incomplete line
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
          this.messageHandler?.(trimmed);
        }
      }
    });

    process.stdin.on('end', () => {
      this.closed = true;
    });

    // Capture stderr with bounded tail (for diagnostics, not protocol)
    const origStderrWrite = process.stderr.write.bind(process.stderr) as (chunk: string | Uint8Array, encoding?: string, cb?: (err?: Error) => void) => boolean;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    process.stderr.write = ((chunk: any, ...args: any[]) => {
      this.stderrTail.append(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf-8'));
      return origStderrWrite(chunk, args[0] as string | undefined, args[1] as ((err?: Error) => void) | undefined);
    }) as typeof process.stderr.write;
  }

  onMessage(handler: (frame: string) => void): void {
    this.messageHandler = handler;
  }

  send(frame: string): void {
    if (this.closed) return;
    // Validate: JSON-RPC over NDJSON forbids bare newlines in frame body
    if (frame.includes('\n')) {
      throw new Error('NDJSON frame must not contain bare newlines');
    }
    process.stdout.write(frame + '\n');
  }

  close(): void {
    this.closed = true;
  }

  get stderrTailOutput(): string {
    return this.stderrTail.tail();
  }
}