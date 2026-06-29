/**
 * Tests for abort utilities: linkAbortSignal, createDeadlineAbortSignal.
 */
import { describe, expect, it, vi } from 'vitest';

import { createDeadlineAbortSignal, linkAbortSignal } from '../../src/utils/abort';

describe('linkAbortSignal', () => {
  it('forwards abort from source to target', () => {
    const source = new AbortController();
    const target = new AbortController();
    const unlink = linkAbortSignal(source.signal, target);

    expect(target.signal.aborted).toBe(false);
    source.abort();
    expect(target.signal.aborted).toBe(true);
    unlink();
  });

  it('immediately aborts target if source is already aborted', () => {
    const source = new AbortController();
    source.abort();
    const target = new AbortController();
    linkAbortSignal(source.signal, target);
    expect(target.signal.aborted).toBe(true);
  });

  it('returns a noop when source is already aborted', () => {
    const source = new AbortController();
    source.abort();
    const target = new AbortController();
    const unlink = linkAbortSignal(source.signal, target);
    expect(typeof unlink).toBe('function');
    // Should not throw
    unlink();
  });

  it('can be unlinked to stop forwarding', () => {
    const source = new AbortController();
    const target = new AbortController();
    const unlink = linkAbortSignal(source.signal, target);

    unlink();
    source.abort();
    expect(target.signal.aborted).toBe(false);
  });
});

describe('createDeadlineAbortSignal', () => {
  it('aborts after the given timeout', async () => {
    vi.useFakeTimers();
    const source = new AbortController();
    const deadline = createDeadlineAbortSignal(source.signal, 100);

    expect(deadline.timedOut()).toBe(false);
    expect(deadline.signal.aborted).toBe(false);

    vi.advanceTimersByTime(100);
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timedOut()).toBe(true);

    deadline.clear();
    vi.useRealTimers();
  });

  it('forwards parent abort before timeout', () => {
    vi.useFakeTimers();
    const source = new AbortController();
    const deadline = createDeadlineAbortSignal(source.signal, 100);

    source.abort();
    expect(deadline.signal.aborted).toBe(true);
    expect(deadline.timedOut()).toBe(false);

    deadline.clear();
    vi.useRealTimers();
  });

  it('does not abort after clear', () => {
    vi.useFakeTimers();
    const source = new AbortController();
    const deadline = createDeadlineAbortSignal(source.signal, 100);

    deadline.clear();
    vi.advanceTimersByTime(100);
    expect(deadline.signal.aborted).toBe(false);
    expect(deadline.timedOut()).toBe(false);

    vi.useRealTimers();
  });

  it('does not abort after parent abort when cleared', () => {
    const source = new AbortController();
    const deadline = createDeadlineAbortSignal(source.signal, 100);

    deadline.clear();
    source.abort();
    expect(deadline.signal.aborted).toBe(false);
  });

  it('immediately times out if source is already aborted', () => {
    const source = new AbortController();
    source.abort();
    const deadline = createDeadlineAbortSignal(source.signal, 100);
    expect(deadline.signal.aborted).toBe(true);
    deadline.clear();
  });
});
