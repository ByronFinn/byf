/**
 * Per-owner image ingestion budget (longest edge, read-entry byte budget).
 *
 * One instance per owner (Agent / standalone core). Nothing is stored in
 * module state, so two cores in one process each compress with their own
 * `[image]` settings and a reload of one never restamps the other.
 *
 * Resolution priority: **env > owning config > built-in default**. The env
 * override is operator-level (process-wide, e.g. `BYF_IMAGE_MAX_EDGE_PX`);
 * the config layer is per-owner (from `[image]` in config.toml).
 *
 * Shared by all image ingestion entry points — `ReadMediaFile`, CLI paste,
 * MCP image output — so "the tool compressed but paste didn't" cannot happen.
 */

import {
  MAX_IMAGE_EDGE_PX,
  READ_IMAGE_BYTE_BUDGET,
  maxImageEdgeFromEnv,
  readImageByteBudgetFromEnv,
} from './image-compress';

export interface ImageConfig {
  readonly maxEdgePx?: number;
  readonly readByteBudget?: number;
}

export class ImageLimits {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
    private config: ImageConfig | undefined = undefined,
  ) {}

  setConfig(config: ImageConfig | undefined): void {
    this.config = config;
  }

  /** Longest edge (px) a decoded image is allowed to keep. */
  maxEdgePx(): number {
    return maxImageEdgeFromEnv(this.env) ?? this.config?.maxEdgePx ?? MAX_IMAGE_EDGE_PX;
  }

  /** Raw file byte budget for the read entry point (before decode/compress). */
  readByteBudget(): number {
    return (
      readImageByteBudgetFromEnv(this.env) ?? this.config?.readByteBudget ?? READ_IMAGE_BYTE_BUDGET
    );
  }
}
