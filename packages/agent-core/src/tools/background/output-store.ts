/**
 * OutputStore — per-task output ring buffer + disk-backed retrieval.
 *
 * Extracted from BackgroundProcessManager (roadmap H2). Holds the in-memory
 * ring buffer (capped tail for UI/notifications) and coordinates with the
 * on-disk `output.log` (the complete, never-truncated source). The disk log
 * is preferred for retrieval when it exists; the ring buffer is the fallback
 * for detached managers / silent tasks.
 */

import {
  appendTaskOutput,
  readTaskOutput,
  readTaskOutputBytes,
  taskOutputExists,
  taskOutputExistsSync,
  taskOutputFile,
  taskOutputSizeBytes,
} from './persist';

/**
 * Maximum bytes of combined output kept in the in-memory ring buffer per
 * task. When exceeded, the oldest chunks are dropped.
 *
 * The ring buffer is a lightweight tail intended for the `/tasks` UI and
 * terminal notifications only — it deliberately discards old output to
 * cap memory. It is NOT the authoritative full output: the complete,
 * never-truncated log lives on disk at `<sessionDir>/tasks/<id>/output.log`.
 * Callers that need the full output (e.g. `TaskOutput`) must read the
 * disk log via `getOutputSizeBytes` / `readOutputBytesFromDisk`.
 */
export const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB

export interface BackgroundTaskOutputSnapshot {
  readonly outputPath?: string;
  readonly outputSizeBytes: number;
  readonly previewBytes: number;
  readonly truncated: boolean;
  readonly fullOutputAvailable: boolean;
  readonly preview: string;
}

export function emptyOutputSnapshot(): BackgroundTaskOutputSnapshot {
  return {
    outputSizeBytes: 0,
    previewBytes: 0,
    truncated: false,
    fullOutputAvailable: false,
    preview: '',
  };
}

interface OutputState {
  chunks: string[];
  /**
   * O(1) running char total of `chunks` (replaces the old per-append
   * `reduce`). NOTE: this is a CHAR count (via `.length`), compared against
   * the byte-named `MAX_OUTPUT_BYTES` cap — preserved verbatim from the
   * original `appendOutput`; the cap is byte-named but char-compared.
   */
  ringChars: number;
  /** Total UTF-8 bytes observed, INCLUDING chunks dropped from the ring buffer. */
  sizeBytes: number;
  /** Serialized disk-append queue. */
  writeQueue: Promise<void>;
  /** Session dir captured at registration; undefined when detached. */
  sessionDir: string | undefined;
}

export class OutputStore {
  private readonly states = new Map<string, OutputState>();

  /** Register a task's output slot. Idempotent if called twice for same id. */
  register(taskId: string, sessionDir: string | undefined): void {
    if (this.states.has(taskId)) return;
    this.states.set(taskId, {
      chunks: [],
      ringChars: 0,
      sizeBytes: 0,
      writeQueue: Promise.resolve(),
      sessionDir,
    });
  }

  /** Drop a task's output state. */
  forget(taskId: string): void {
    this.states.delete(taskId);
  }

  /** Drop all output state (used by the manager's `_reset()` test helper). */
  clear(): void {
    this.states.clear();
  }

  /**
   * Append a chunk: update the ring buffer (dropping oldest when over cap)
   * and enqueue a disk append when attached. Mirrors the old `appendOutput`.
   */
  append(taskId: string, chunk: string): void {
    const state = this.states.get(taskId);
    if (state === undefined) return;
    state.sizeBytes += Buffer.byteLength(chunk, 'utf-8');
    state.chunks.push(chunk);
    state.ringChars += chunk.length;
    while (state.ringChars > MAX_OUTPUT_BYTES && state.chunks.length > 1) {
      const removed = state.chunks.shift();
      if (removed === undefined) break;
      state.ringChars -= removed.length;
    }

    if (state.sessionDir === undefined) return;
    const dir = state.sessionDir;
    state.writeQueue = state.writeQueue
      .then(() => appendTaskOutput(dir, taskId, chunk))
      .catch(() => {});
  }

  /** Await pending disk appends for a task. No-op for unknown tasks. */
  async flush(taskId: string): Promise<void> {
    const state = this.states.get(taskId);
    if (state === undefined) return;
    await state.writeQueue;
  }

  /** Ring-buffer tail (in-memory only). Returns '' for unknown tasks. */
  getTail(taskId: string, tail?: number): string {
    const state = this.states.get(taskId);
    if (state === undefined) return '';
    const full = state.chunks.join('');
    if (tail !== undefined && tail < full.length) return full.slice(-tail);
    return full;
  }

  /**
   * Resolve the session dir used for disk reads. Ghosts (tasks with no live
   * state, e.g. reconciled-lost tasks loaded from disk) fall back to the
   * manager-level session dir passed in by the caller.
   */
  private sessionDirFor(
    taskId: string,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): string | undefined {
    const state = this.states.get(taskId);
    if (state !== undefined) return state.sessionDir;
    if (isGhost) return managerSessionDir;
    return undefined;
  }

  async getOutputSizeBytes(
    taskId: string,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): Promise<number> {
    const dir = this.sessionDirFor(taskId, isGhost, managerSessionDir);
    if (dir === undefined) return 0;
    return taskOutputSizeBytes(dir, taskId);
  }

  async readOutputBytesFromDisk(
    taskId: string,
    offset: number,
    maxBytes: number,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): Promise<string> {
    const dir = this.sessionDirFor(taskId, isGhost, managerSessionDir);
    if (dir === undefined) return '';
    return readTaskOutputBytes(dir, taskId, offset, maxBytes);
  }

  async getOutputSnapshot(
    taskId: string,
    maxPreviewBytes: number,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): Promise<BackgroundTaskOutputSnapshot> {
    const previewLimit = Math.max(0, Math.trunc(maxPreviewBytes));
    const dir = this.sessionDirFor(taskId, isGhost, managerSessionDir);
    // Disk-preferred path (matches old getOutputSnapshot).
    if (dir !== undefined && (await taskOutputExists(dir, taskId))) {
      const outputSizeBytes = await taskOutputSizeBytes(dir, taskId);
      const previewOffset = Math.max(0, outputSizeBytes - previewLimit);
      const previewBytes = outputSizeBytes - previewOffset;
      const preview = await readTaskOutputBytes(dir, taskId, previewOffset, previewBytes);
      return {
        outputPath: taskOutputFile(dir, taskId),
        outputSizeBytes,
        previewBytes,
        truncated: previewOffset > 0,
        fullOutputAvailable: true,
        preview,
      };
    }
    // Ring-buffer fallback.
    const state = this.states.get(taskId);
    if (state === undefined) return emptyOutputSnapshot();
    const available = Buffer.from(state.chunks.join(''), 'utf-8');
    const previewBytes = Math.min(previewLimit, available.byteLength, state.sizeBytes);
    const previewOffset = available.byteLength - previewBytes;
    return {
      outputSizeBytes: state.sizeBytes,
      previewBytes,
      truncated: state.sizeBytes > previewBytes,
      fullOutputAvailable: false,
      preview: available.subarray(previewOffset).toString('utf-8'),
    };
  }

  async readOutput(
    taskId: string,
    tail: number | undefined,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): Promise<string> {
    const state = this.states.get(taskId);
    const dir = this.sessionDirFor(taskId, isGhost, managerSessionDir);
    if (dir !== undefined) {
      await state?.writeQueue;
      const persisted = await readTaskOutput(dir, taskId);
      if (persisted.length > 0) {
        if (tail !== undefined && tail < persisted.length) return persisted.slice(-tail);
        return persisted;
      }
    }
    return this.getTail(taskId, tail);
  }

  getOutputPath(
    taskId: string,
    isGhost: boolean,
    managerSessionDir: string | undefined,
  ): string | undefined {
    const dir = this.sessionDirFor(taskId, isGhost, managerSessionDir);
    if (dir === undefined) return undefined;
    if (!taskOutputExistsSync(dir, taskId)) return undefined;
    return taskOutputFile(dir, taskId);
  }
}
