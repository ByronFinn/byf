import { visibleWidth } from '@earendil-works/pi-tui';
import { describe, expect, it } from 'vitest';

import { buildUsageReportLines, UsagePanelComponent } from '#/tui/components/messages/usage-panel';
import { darkColors } from '#/tui/theme/colors';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('UsagePanelComponent', () => {
  it('formats session, context, and managed usage sections', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          byf: {
            inputOther: 1000,
            inputCacheRead: 500,
            inputCacheCreation: 500,
            output: 250,
          },
        },
      } as never,
      contextUsage: 0.25,
      contextTokens: 2500,
      maxContextTokens: 10000,
      managedUsage: {
        summary: {
          label: 'daily',
          used: 20,
          limit: 100,
          resetHint: 'resets tomorrow',
        },
        limits: [],
      },
    }).map(strip);

    expect(lines).toContain('Session usage');
    expect(lines).toContain('  byf  input 2.0k (cache 25%)  output 250  total 2.3k');
    expect(lines).toContain('Context window');
    expect(lines.join('\n')).toContain('25.0%');
    expect(lines).toContain('Plan usage');
    expect(lines.join('\n')).toContain('80% left');
    expect(lines.join('\n')).toContain('(resets tomorrow)');
  });

  it('wraps preformatted usage lines in a bordered panel', () => {
    const component = new UsagePanelComponent(['Session usage'], darkColors.primary);
    const output = component.render(80).map(strip);

    expect(output[0]).toContain(' Usage ');
    expect(output[1]).toContain('Session usage');
  });

  it('truncates lines wider than the terminal so the panel never overflows', () => {
    const longLine = 'error: ' + 'x'.repeat(200);
    const component = new UsagePanelComponent([longLine], darkColors.primary);
    const width = 60;

    const output = component.render(width);

    for (const line of output) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(width);
    }
  });
});

// ---------------------------------------------------------------------------
// Cache hit-rate suffix — Acceptance Criterion #1: /usage panel per-model
// and total-row (cache XX%) suffix
// ---------------------------------------------------------------------------

describe('buildUsageReportLines — cache hit-rate suffix', () => {
  // ---- single model -------------------------------------------------------

  it('shows cache suffix when model has substantial cache reads (70% hit rate)', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 1000,
            inputCacheRead: 7000,
            inputCacheCreation: 2000,
            output: 3000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    expect(lines).toContain('Session usage');
    const modelLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 10.0k (cache 70%)');
  });

  it('omits cache suffix when all cache fields are 0', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'gpt-5': {
            inputOther: 1000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 500,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('gpt-5'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 1.0k');
    expect(modelLine).not.toContain('(cache');
  });

  it('omits cache suffix for first turn (cache writes but no reads)', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 8000,
            inputCacheRead: 0,
            inputCacheCreation: 2000,
            output: 1000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 10.0k');
    expect(modelLine).not.toContain('(cache');
  });

  it('shows 100% cache when all input tokens served from cache', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 0,
            inputCacheRead: 5000,
            inputCacheCreation: 0,
            output: 2000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 5.0k (cache 100%)');
  });

  it('shows 1% cache with very small hit rate', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 9900,
            inputCacheRead: 100,
            inputCacheCreation: 0,
            output: 500,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 10.0k (cache 1%)');
  });

  it('handles zero denominator — all input fields zero, shows "input 0" with no suffix', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 0,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 100,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 0');
    expect(modelLine).not.toContain('(cache');
  });

  it('shows integer precision — 33.3% rounds down to 33%', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 333,
            inputCacheRead: 333,
            inputCacheCreation: 334,
            output: 100,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('model'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 1.0k (cache 33%)');
  });

  it('rounds up — 99.6% rounds to 100%', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 4,
            inputCacheRead: 996,
            inputCacheCreation: 0,
            output: 100,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('model'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 1.0k (cache 100%)');
  });

  it('rounds down — 99.4% rounds to 99%', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 6,
            inputCacheRead: 994,
            inputCacheCreation: 0,
            output: 100,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('model'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 1.0k (cache 99%)');
  });

  it('omits cache suffix for provider without cache support', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          gemini: {
            inputOther: 5000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 2000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('gemini'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 5.0k');
    expect(modelLine).not.toContain('(cache');
  });

  it('omits cache suffix when only cache creation, zero other input', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 0,
            inputCacheRead: 0,
            inputCacheCreation: 5000,
            output: 1000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('model'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 5.0k');
    expect(modelLine).not.toContain('(cache');
  });

  it('shows M-scale formatting with cache suffix for large values', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 500000,
            inputCacheRead: 1_500_000,
            inputCacheCreation: 0,
            output: 200000,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const modelLine = lines.find((l) => l.includes('model'));
    expect(modelLine).toBeDefined();
    expect(modelLine).toContain('input 2.0M (cache 75%)');
  });

  // ---- multi-model --------------------------------------------------------

  it('mixed cache states — one cached model, one not, total shows aggregated hit rate', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          'claude-sonnet': {
            inputOther: 2000,
            inputCacheRead: 6000,
            inputCacheCreation: 2000,
            output: 1000,
          },
          'gpt-5': {
            inputOther: 3000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 500,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const claudeLine = lines.find((l) => l.includes('claude-sonnet'));
    expect(claudeLine).toBeDefined();
    expect(claudeLine).toContain('input 10.0k (cache 60%)');

    const gptLine = lines.find((l) => l.includes('gpt-5'));
    expect(gptLine).toBeDefined();
    expect(gptLine).toContain('input 3.0k');
    expect(gptLine).not.toContain('(cache');

    const totalLine = lines.find((l) => l.startsWith('  total'));
    expect(totalLine).toBeDefined();
    // 6000 / 13000 ≈ 46.15% → 46%
    expect(totalLine).toContain('input 13.0k (cache 46%)');
  });

  it('multi-model, no cache at all — all rows and total omit suffix', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          a: {
            inputOther: 1000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 500,
          },
          b: {
            inputOther: 2000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 300,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    for (const model of ['a', 'b']) {
      const modelLine = lines.find((l) => l.includes(`  ${model}`));
      expect(modelLine).toBeDefined();
      expect(modelLine).not.toContain('(cache');
    }

    const totalLine = lines.find((l) => l.startsWith('  total'));
    expect(totalLine).toBeDefined();
    expect(totalLine).not.toContain('(cache');
  });

  it('one model 100% cache, one model no cache — total shows aggregated', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          a: {
            inputOther: 0,
            inputCacheRead: 5000,
            inputCacheCreation: 0,
            output: 1000,
          },
          b: {
            inputOther: 3000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 500,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const lineA = lines.find((l) => l.includes('  a'));
    expect(lineA).toBeDefined();
    expect(lineA).toContain('input 5.0k (cache 100%)');

    const lineB = lines.find((l) => l.includes('  b'));
    expect(lineB).toBeDefined();
    expect(lineB).toContain('input 3.0k');
    expect(lineB).not.toContain('(cache');

    const totalLine = lines.find((l) => l.startsWith('  total'));
    expect(totalLine).toBeDefined();
    // 5000 / 8000 = 62.5% → 62%
    expect(totalLine).toContain('input 8.0k (cache 62%)');
  });

  it('three models with different hit rates, total shows aggregated', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          a: {
            inputOther: 1000,
            inputCacheRead: 4000,
            inputCacheCreation: 0,
            output: 500,
          },
          b: {
            inputOther: 2000,
            inputCacheRead: 2000,
            inputCacheCreation: 1000,
            output: 300,
          },
          c: {
            inputOther: 500,
            inputCacheRead: 500,
            inputCacheCreation: 9000,
            output: 200,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const lineA = lines.find((l) => l.includes('  a'));
    expect(lineA).toBeDefined();
    // 4000 / 5000 = 80%
    expect(lineA).toContain('input 5.0k (cache 80%)');

    const lineB = lines.find((l) => l.includes('  b'));
    expect(lineB).toBeDefined();
    // 2000 / 5000 = 40%
    expect(lineB).toContain('input 5.0k (cache 40%)');

    const lineC = lines.find((l) => l.includes('  c'));
    expect(lineC).toBeDefined();
    // 500 / 10000 = 5%
    expect(lineC).toContain('input 10.0k (cache 5%)');

    const totalLine = lines.find((l) => l.startsWith('  total'));
    expect(totalLine).toBeDefined();
    // total cache read = 4000 + 2000 + 500 = 6500
    // total input = 5000 + 5000 + 10000 = 20000
    // 6500 / 20000 = 32.5% → 32%
    expect(totalLine).toContain('input 20.0k (cache 32%)');
  });

  // ---- regression and error states ----------------------------------------

  it('full output preserved when no cache data — no regression', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          byf: {
            inputOther: 1000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 250,
          },
        },
      } as never,
      contextUsage: 0.25,
      contextTokens: 2500,
      maxContextTokens: 10000,
      managedUsage: {
        summary: {
          label: 'daily',
          used: 20,
          limit: 100,
          resetHint: 'resets tomorrow',
        },
        limits: [],
      },
    }).map(strip);

    expect(lines).toContain('Session usage');
    expect(lines).toContain('Context window');
    expect(lines.join('\n')).toContain('25.0%');
    expect(lines).toContain('Plan usage');
    expect(lines.join('\n')).toContain('80% left');
    expect(lines.join('\n')).toContain('(resets tomorrow)');

    const modelLine = lines.find((l) => l.includes('byf'));
    expect(modelLine).toBeDefined();
    expect(modelLine).not.toContain('(cache');
  });

  it('shows error message when sessionUsageError present', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsageError: 'Failed to fetch usage',
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    expect(lines).toContain('  Failed to fetch usage');
    // No cache-related content should appear in error path
    expect(lines.join('\n')).not.toContain('(cache');
  });

  it('shows empty message when byModel has no models recorded', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {},
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    expect(lines).toContain('  No token usage recorded yet.');
    // No cache-related content should appear in empty path
    expect(lines.join('\n')).not.toContain('(cache');
  });
});

// ---------------------------------------------------------------------------
// Context breakdown (estimated) — Issue #197: 6-row input-token distribution
// plus an "Average cache hit rate" line, rendered between "Context window"
// and "Plan usage".
// ---------------------------------------------------------------------------

// 363 + 334 + 212 + 38 + 33 + 20 = 1000 → after largest-remainder normalization
// the percent fields sum strictly to 100.0; these raw tokens reproduce the
// PRD's reference panel (MCP tools 36.3%, System tools 33.4%, …).
const PRD_BREAKDOWN = {
  tokens: {
    mcpTools: 9900,
    systemTools: 9100,
    messages: 5800,
    metaContext: 1000,
    skills: 900,
    systemPrompt: 500,
  },
  percent: {
    mcpTools: 36.3,
    systemTools: 33.4,
    messages: 21.2,
    metaContext: 3.8,
    skills: 3.3,
    systemPrompt: 1.9,
  },
} as const;

describe('buildUsageReportLines — Context breakdown (estimated)', () => {
  it('renders header, 6 rows in fixed order, and the Average cache hit rate line', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 1900,
            inputCacheRead: 8100,
            inputCacheCreation: 0,
            output: 100,
          },
        },
        cacheHitRate: 0.81,
        inputBreakdown: PRD_BREAKDOWN,
      } as never,
      contextUsage: 0.1,
      contextTokens: 1000,
      maxContextTokens: 10000,
    }).map(strip);

    // Header present
    expect(lines).toContain('Context breakdown (estimated)');

    // Six rows in the FIXED order: MCP tools / System tools / Messages /
    // Meta context / Skills / System prompt. Capture the breakdown row
    // indices and assert their relative order matches the spec.
    const labels = [
      'MCP tools',
      'System tools',
      'Messages',
      'Meta context',
      'Skills',
      'System prompt',
    ];
    const indices = labels.map((label) => lines.findIndex((l) => l.includes(label)));
    for (const idx of indices) expect(idx).toBeGreaterThanOrEqual(0);
    expect(indices).toStrictEqual([...indices].toSorted((a, b) => a - b));

    // Average cache hit rate line present (81% from cacheHitRate 0.81)
    expect(lines.join('\n')).toContain('Average cache hit rate');
    expect(lines.join('\n')).toContain('81%');
  });

  it('shows percent value and ~-prefixed absolute token count on each row', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {},
        cacheHitRate: 0.5,
        inputBreakdown: PRD_BREAKDOWN,
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    const mcpRow = lines.find((l) => l.includes('MCP tools'));
    expect(mcpRow).toBeDefined();
    // percent (36.3%) and absolute (~9.9k — formatTokenCount lowercases)
    expect(mcpRow).toContain('36.3%');
    expect(mcpRow).toContain('~9.9k');

    const sysRow = lines.find((l) => l.includes('System tools'));
    expect(sysRow).toBeDefined();
    expect(sysRow).toContain('33.4%');
    expect(sysRow).toContain('~9.1k');
  });

  it('omits the entire section when inputBreakdown is undefined', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {},
        cacheHitRate: 0.5,
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    expect(lines.join('\n')).not.toContain('Context breakdown');
  });

  it('omits the Average cache hit rate line when cacheHitRate is undefined', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {},
        inputBreakdown: PRD_BREAKDOWN,
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    // Section still renders
    expect(lines).toContain('Context breakdown (estimated)');
    // But no cache hit rate line
    expect(lines.join('\n')).not.toContain('Average cache hit rate');
  });

  it('degrades to absolute-only rows when percent fields are all undefined (total=0)', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {},
        cacheHitRate: 0.5,
        inputBreakdown: {
          tokens: {
            mcpTools: 0,
            systemTools: 0,
            messages: 0,
            metaContext: 0,
            skills: 0,
            systemPrompt: 0,
          },
          percent: {
            mcpTools: undefined,
            systemTools: undefined,
            messages: undefined,
            metaContext: undefined,
            skills: undefined,
            systemPrompt: undefined,
          },
        },
      } as never,
      contextUsage: 0,
      contextTokens: 0,
      maxContextTokens: 0,
    }).map(strip);

    expect(lines).toContain('Context breakdown (estimated)');
    // All six labels still render
    for (const label of [
      'MCP tools',
      'System tools',
      'Messages',
      'Meta context',
      'Skills',
      'System prompt',
    ]) {
      const row = lines.find((l) => l.includes(label));
      expect(row).toBeDefined();
      // No percentage on degraded rows
      expect(row).not.toContain('%');
      // Absolute value present (~0)
      expect(row).toContain('~0');
    }
  });

  it('places Context breakdown after Context window and before Plan usage', () => {
    const lines = buildUsageReportLines({
      colors: darkColors,
      sessionUsage: {
        byModel: {
          model: {
            inputOther: 1000,
            inputCacheRead: 0,
            inputCacheCreation: 0,
            output: 100,
          },
        },
        cacheHitRate: 0.2,
        inputBreakdown: PRD_BREAKDOWN,
      } as never,
      contextUsage: 0.1,
      contextTokens: 1000,
      maxContextTokens: 10000,
      managedUsage: {
        summary: { label: 'daily', used: 1, limit: 100 },
        limits: [],
      },
    }).map(strip);

    const joined = lines.join('\n');
    const ctxWin = joined.indexOf('Context window');
    const breakdown = joined.indexOf('Context breakdown (estimated)');
    const plan = joined.indexOf('Plan usage');

    expect(ctxWin).toBeGreaterThanOrEqual(0);
    expect(breakdown).toBeGreaterThan(ctxWin);
    expect(plan).toBeGreaterThan(breakdown);
  });
});
