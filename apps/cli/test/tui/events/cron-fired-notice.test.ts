/**
 * PRD-0023 #244 — cron.fired TUI notice formatting (shipped path used by ByfTui).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatCronFiredNotice } from '#/tui/events/cron-fired-notice';

describe('formatCronFiredNotice (PRD-0023 #244)', () => {
  it('formats a basic fire title and full prompt detail', () => {
    const notice = formatCronFiredNotice(
      { jobId: 'deadbeef', stale: false, coalescedCount: 1 },
      'check status',
    );
    expect(notice.title).toBe('Cron deadbeef fired');
    expect(notice.detail).toBe('check status');
  });

  it('annotates stale and coalesced fires', () => {
    const notice = formatCronFiredNotice(
      { jobId: 'cafebabe', stale: true, coalescedCount: 4 },
      'wake up',
    );
    expect(notice.title).toBe('Cron cafebabe fired · stale · coalesced×4');
    expect(notice.detail).toBe('wake up');
  });

  it('does not show coalesce when count is 1', () => {
    const notice = formatCronFiredNotice(
      { jobId: 'aaaaaaaa', stale: true, coalescedCount: 1 },
      'once',
    );
    expect(notice.title).toBe('Cron aaaaaaaa fired · stale');
    expect(notice.title).not.toContain('coalesced');
  });

  it('truncates long prompts at 200 characters with ellipsis', () => {
    const long = 'x'.repeat(250);
    const notice = formatCronFiredNotice(
      { jobId: 'bbbbbbbb', stale: false, coalescedCount: 1 },
      long,
    );
    expect(notice.detail.length).toBe(201); // 200 + …
    expect(notice.detail.endsWith('…')).toBe(true);
    expect(notice.detail.startsWith('x'.repeat(200))).toBe(true);
  });

  it('is the formatter wired into ByfTui cron.fired handling', () => {
    // Structural proof the interactive host uses the shipped helper (not a fork).
    const src = readFileSync(join(import.meta.dirname, '../../../src/tui/byf-tui.ts'), 'utf8');
    expect(src).toContain("from './events/cron-fired-notice'");
    expect(src).toContain('formatCronFiredNotice(event.origin, event.prompt)');
    expect(src).toContain("case 'cron.fired'");
  });
});
