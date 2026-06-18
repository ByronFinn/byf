import { describe, expect, it } from 'vitest';

import { buildStatusReportLines } from '#/tui/components/messages/status-panel';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('status panel report lines', () => {
  it('formats runtime status, context, and managed usage without account or AGENTS.md rows', () => {
    const lines = buildStatusReportLines({
      colors: darkColors,
      version: '1.2.3',
      model: 'k2',
      workDir: '/tmp/project',
      sessionId: 'ses-1',
      sessionTitle: 'Implement status',
      thinking: true,
      permissionMode: 'manual',
      contextUsage: 0.25,
      contextTokens: 2500,
      maxContextTokens: 10000,
      availableModels: {
        k2: {
          provider: 'test-provider',
          model: 'byf-k2',
          maxContextSize: 10000,
          displayName: 'Byf K2',
        },
      },
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
      },
      managedUsage: {
        summary: null,
        limits: [
          {
            label: '5h limit',
            used: 8,
            limit: 100,
            resetHint: 'resets in 1h',
          },
        ],
      },
    }).map(strip);

    const output = lines.join('\n');
    expect(output).toContain('>_ BYF (v1.2.3)');
    expect(output).toContain('Model        Byf K2 (thinking on)');
    expect(output).toContain('Directory    /tmp/project');
    expect(output).toContain('Permissions  auto');
    expect(output).toContain('Session      ses-1');
    expect(output).toContain('Title        Implement status');
    expect(output).toContain('Context window');
    expect(output).toContain('25.0%');
    expect(output).toContain('(3.0k / 12.0k)');
    expect(output).toContain('Plan usage');
    expect(output).toContain('92% left');
    expect(output).not.toContain('Account');
    expect(output).not.toContain('AGENTS.md');
    expect(output).not.toContain('Runtime');
  });

  it('falls back to app state and shows status load errors as warnings', () => {
    const lines = buildStatusReportLines({
      colors: darkColors,
      version: '1.2.3',
      model: '',
      workDir: '/tmp/project',
      sessionId: '',
      sessionTitle: null,
      thinking: false,
      permissionMode: 'manual',
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
      availableModels: {},
      statusError: 'No active session',
    }).map(strip);

    const output = lines.join('\n');
    expect(output).toContain('Model        not set');
    expect(output).toContain('Session      none');
    expect(output).toContain('Warning      No active session');
    expect(output).toContain('No context window data available.');
  });

  // ── Cache section (AC #4) ──────────────────────────────────────────

  const baseStatusOptions = {
    colors: darkColors,
    version: '1.2.3',
    model: 'k2',
    workDir: '/tmp/project',
    sessionId: 'ses-1',
    sessionTitle: null as string | null,
    thinking: true,
    permissionMode: 'manual' as const,
    contextUsage: 0.25,
    contextTokens: 2500,
    maxContextTokens: 10000,
    availableModels: {
      k2: {
        provider: 'test-provider',
        model: 'byf-k2',
        maxContextSize: 10000,
        displayName: 'Byf K2',
      },
    },
  };

  /** Thin helper to build, strip ANSI, and join lines. */
  function render(options: Parameters<typeof buildStatusReportLines>[0]): string {
    return buildStatusReportLines(options).map(strip).join('\n');
  }

  it('Scenario 1: renders Cache section with hit rate and read/write breakdown', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 1000,
            output: 5000,
            inputCacheRead: 10700,
            inputCacheCreation: 5000,
          },
        },
      },
    });
    expect(output).toContain('Cache');
    expect(output).toContain('64%');
    expect(output).toContain('10.7k read');
    expect(output).toContain('5.0k write');
  });

  it('Scenario 2: omits Cache section when status.usage is absent', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
      },
    });
    expect(output).not.toContain('Cache');
    expect(output).toContain('Model');
    expect(output).toContain('Context window');
  });

  it('Scenario 3: omits Cache section when usage.total is absent', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {},
      },
    });
    expect(output).not.toContain('Cache');
    expect(output).toContain('Context window');
  });

  it('Scenario 4: omits Cache section when all cache fields are zero', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 5000,
            output: 2000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
          },
        },
      },
    });
    expect(output).not.toContain('Cache');
    expect(output).not.toContain('read');
    expect(output).not.toContain('write');
  });

  it('Scenario 5: omits Cache section when total input is zero', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 0,
            output: 0,
            inputCacheRead: 0,
            inputCacheCreation: 0,
          },
        },
      },
    });
    expect(output).not.toContain('Cache');
  });

  it('Scenario 6: rounds 86.5% down to 86% (banker\'s rounding)', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 135,
            inputCacheRead: 865,
            inputCacheCreation: 0,
            output: 0,
          },
        },
      },
    });
    expect(output).toContain('86%');
  });

  it('Scenario 7: rounds 87.5% up to 88% (banker\'s rounding)', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 125,
            inputCacheRead: 875,
            inputCacheCreation: 0,
            output: 0,
          },
        },
      },
    });
    expect(output).toContain('88%');
  });

  it('Scenario 8: shows 100% hit rate and zero write', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 0,
            inputCacheRead: 10000,
            inputCacheCreation: 0,
            output: 0,
          },
        },
      },
    });
    expect(output).toContain('100%');
    expect(output).toContain('10.0k read');
    expect(output).toContain('0 write');
  });

  it('Scenario 9: formats M-scale token values', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 500000,
            inputCacheRead: 1500000,
            inputCacheCreation: 500000,
            output: 0,
          },
        },
      },
    });
    expect(output).toContain('1.5M read');
    expect(output).toContain('500.0k write');
  });

  it('Scenario 10: Cache section appears between Context window and Plan usage', () => {
    const lines = buildStatusReportLines({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 1000,
            output: 5000,
            inputCacheRead: 10700,
            inputCacheCreation: 5000,
          },
        },
      },
      managedUsage: {
        summary: null,
        limits: [
          {
            label: '5h limit',
            used: 8,
            limit: 100,
            resetHint: 'resets in 1h',
          },
        ],
      },
    }).map(strip);

    const contextIdx = lines.findIndex((l) => l.includes('Context window'));
    const cacheIdx = lines.findIndex((l) => l.startsWith('  Cache'));
    const planIdx = lines.findIndex((l) => l.includes('Plan usage'));

    expect(contextIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(planIdx).toBeGreaterThan(-1);
    expect(contextIdx).toBeLessThan(cacheIdx);
    expect(cacheIdx).toBeLessThan(planIdx);
  });

  it('Scenario 12: all legacy sections remain intact with Cache present', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
        usage: {
          total: {
            inputOther: 1000,
            output: 5000,
            inputCacheRead: 10700,
            inputCacheCreation: 5000,
          },
        },
      },
      managedUsage: {
        summary: null,
        limits: [
          {
            label: '5h limit',
            used: 8,
            limit: 100,
            resetHint: 'resets in 1h',
          },
        ],
      },
    });
    expect(output).toContain('>_ BYF');
    expect(output).toContain('Model');
    expect(output).toContain('Directory');
    expect(output).toContain('Permissions');
    expect(output).toContain('Session');
    expect(output).toContain('Context window');
    expect(output).toContain('Plan usage');
    expect(output).toContain('Cache');
  });

  it('Scenario 13: no Cache section when cache data absent (regression)', () => {
    const output = render({
      ...baseStatusOptions,
      status: {
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 3000,
        maxContextTokens: 12000,
        contextUsage: 0.25,
      },
      managedUsage: {
        summary: null,
        limits: [
          {
            label: '5h limit',
            used: 8,
            limit: 100,
            resetHint: 'resets in 1h',
          },
        ],
      },
    });
    expect(output).not.toContain('Cache');
    expect(output).not.toContain('read');
    expect(output).not.toContain('write');
    expect(output).toContain('>_ BYF');
    expect(output).toContain('Context window');
    expect(output).toContain('Plan usage');
  });
});
