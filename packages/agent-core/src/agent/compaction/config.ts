import type { MaskingConfig } from '../context/observation-masking';
import { DEFAULT_MASKING_CONFIG } from '../context/observation-masking';

export interface CompactionConfig {
  triggerRatio: number;
  blockRatio: number;
  reservedContextSize: number;
  maxCompactionPerTurn: number;
  maxRecentSteps: number;
  maxRecentUserMessages: number;
  maxRecentSizeRatio: number;
  masking?: MaskingConfig;
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  triggerRatio: 0.85,
  blockRatio: 0.85, // Same as triggerRatio to disable async compaction
  reservedContextSize: 50_000,
  maxCompactionPerTurn: 3,
  maxRecentSteps: 3,
  maxRecentUserMessages: Infinity,
  maxRecentSizeRatio: 0.2,
  masking: DEFAULT_MASKING_CONFIG,
};
