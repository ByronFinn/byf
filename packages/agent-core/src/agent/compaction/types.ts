export interface CompactionResult {
  summary: string;
  compactedCount: number;
  tokensBefore: number;
  tokensAfter: number;
}

export interface CompactionBeginData {
  instruction?: string;
  source: 'manual' | 'auto';
}
