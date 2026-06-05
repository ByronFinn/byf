import { join } from 'node:path';

import type { Kaos } from '@byfriends/kaos';

export interface ScratchManagerConfig {
  /** 每个 session 的最大 scratch 大小 (bytes)，默认 50MB */
  maxSessionSize: number;
  /** 每个 session 的最大文件数，默认 100 */
  maxFileCount: number;
  /** scratch 目录 */
  scratchDir: string;
}

interface ScratchFile {
  path: string;
  size: number;
  createdAt: number;
}

export class ScratchManager {
  private currentSize = 0;
  private files: ScratchFile[] = [];

  constructor(
    private readonly kaos: Kaos,
    private readonly config: ScratchManagerConfig,
  ) {}

  async writeOutput(toolCallId: string, output: string): Promise<string> {
    await this.kaos.mkdir(this.config.scratchDir, { parents: true, existOk: true });

    const filePath = join(this.config.scratchDir, `${toolCallId}.txt`);
    const size = Buffer.byteLength(output, 'utf-8');

    await this.evictIfNeeded(size);

    await this.kaos.writeText(filePath, output);

    this.files.push({ path: filePath, size, createdAt: Date.now() });
    this.currentSize += size;

    return filePath;
  }

  async readOutput(filePath: string): Promise<string> {
    return this.kaos.readText(filePath);
  }

  private async evictIfNeeded(neededBytes: number): Promise<void> {
    // Sort by creation time (oldest first)
    this.files.sort((a, b) => a.createdAt - b.createdAt);

    while (
      this.files.length > 0 &&
      (this.files.length >= this.config.maxFileCount ||
        this.currentSize + neededBytes > this.config.maxSessionSize)
    ) {
      const oldest = this.files.shift()!;
      try {
        await this.kaos.exec('rm', oldest.path);
      } catch {
        // Best effort removal
      }
      this.currentSize -= oldest.size;
    }
  }

  async cleanup(): Promise<void> {
    for (const file of this.files) {
      try {
        await this.kaos.exec('rm', file.path);
      } catch {
        // Best effort removal
      }
    }
    this.files = [];
    this.currentSize = 0;

    try {
      await this.kaos.exec('rm', '-rf', this.config.scratchDir);
    } catch {
      // Best effort removal
    }
  }
}
