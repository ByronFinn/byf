import { describe, it, expect } from 'vitest';

import { FooterComponent, formatContextStatus } from '#/tui/components/chrome/footer';
import { darkColors } from '#/tui/theme/colors';
import type { AppState } from '#/tui/types';

const ANSI_SGR = /\u001B\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

function baseState(overrides: Record<string, unknown> = {}): AppState {
  const state = {
    model: 'k2',
    workDir: '/tmp',
    sessionId: 'sess_1',
    yolo: false,
    permissionMode: 'manual',
    thinkingEffort: 'off',
    contextUsage: 0.45,
    contextTokens: 22000,
    maxContextTokens: 48000,
    isStreaming: false,
    isCompacting: false,
    isReplaying: false,
    streamingPhase: 'idle',
    streamingStartTime: 0,
    theme: 'dark',
    version: 'test',
    editorCommand: null,
    notifications: { enabled: true, condition: 'unfocused' },
    availableModels: {},
    availableProviders: {},
    sessionTitle: null,
    ...overrides,
  };
  return state as never as AppState;
}

describe('Footer — cache badge (Group B)', () => {
  // ── B1: shows badge ────────────────────────────────────────────
  it('B1: shows cache badge on line 2 when cacheHitRate > 0', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.87 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*87%/);
  });

  // ── B2: hides badge at 0 ───────────────────────────────────────
  it('B2: hides cache badge when cacheHitRate is 0', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    // context line still renders
    expect(stripped).toMatch(/context:/);
  });

  // ── B3: hides badge at undefined ───────────────────────────────
  it('B3: hides cache badge when cacheHitRate is undefined', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: undefined }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    expect(stripped).toMatch(/context:/);
  });

  // ── B4: 99.9% → 100% ──────────────────────────────────────────
  it('B4: rounds 0.999 → "100%" with banker\'s rounding', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.999 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*100%/);
  });

  // ── B5: 49.5% → 50% ───────────────────────────────────────────
  it('B5: rounds 0.495 → "50%" with banker\'s rounding', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.495 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*50%/);
  });

  // ── B10: formatContextStatus unchanged ────────────────────────
  it('B10: formatContextStatus returns context-only string, no cache:', () => {
    const result = formatContextStatus(0.45, 22000, 48000);
    expect(result).toContain('context:');
    expect(result).not.toContain('cache:');
  });

  // ── B12: key absent ────────────────────────────────────────────
  it('B12: no cache badge when cacheHitRate key is absent from state', () => {
    // Construct state without cacheHitRate — key literally absent.
    const stateWithout = {
      model: 'k2',
      workDir: '/tmp',
      sessionId: 'sess_1',
      yolo: false,
      permissionMode: 'manual',
      thinkingEffort: 'off',
      contextUsage: 0.3,
      contextTokens: 10000,
      maxContextTokens: 48000,
      isStreaming: false,
      isCompacting: false,
      isReplaying: false,
      streamingPhase: 'idle',
      streamingStartTime: 0,
      theme: 'dark',
      version: 'test',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
      availableModels: {},
      availableProviders: {},
      sessionTitle: null,
    } as never as AppState;

    const fc = new FooterComponent(stateWithout, darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    expect(stripped).toMatch(/context:/);
  });
});
