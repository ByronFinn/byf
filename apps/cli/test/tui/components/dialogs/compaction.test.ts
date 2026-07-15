import { describe, expect, it } from 'vitest';

import { CompactionComponent } from '#/tui/components/dialogs/compaction';
import { darkColors } from '#/tui/theme/colors';
import { isExpandable } from '#/tui/utils/component-capabilities';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

describe('CompactionComponent', () => {
  it('renders the custom instruction below the compacting label', () => {
    const component = new CompactionComponent(darkColors, undefined, 'keep the recent files only');

    try {
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Compacting context...');
      expect(text).toContain('  keep the recent files only');
    } finally {
      component.dispose();
    }
  });

  it('renders a cancelled terminal state', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markCanceled();
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Compaction cancelled');
      expect(text).not.toContain('Compacting context...');
    } finally {
      component.dispose();
    }
  });

  it('shows Ctrl-O hint when done with a non-empty summary', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markDone(50000, 12000, 'Summarized older turns');
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Compaction complete');
      expect(text).toContain('50000 → 12000 tokens');
      expect(text).toContain('Ctrl-O to show compaction summary');
      // Collapsed by default — summary body not rendered.
      expect(text).not.toContain('Summarized older turns');
    } finally {
      component.dispose();
    }
  });

  it('does not show Ctrl-O hint when summary is empty', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markDone(50000, 12000, '');
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Compaction complete');
      expect(text).not.toContain('Ctrl-O');
    } finally {
      component.dispose();
    }
  });

  it('does not show Ctrl-O hint when summary is undefined', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markDone(50000, 12000);
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Compaction complete');
      expect(text).not.toContain('Ctrl-O');
    } finally {
      component.dispose();
    }
  });

  it('expands to show summary body on setExpanded(true)', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markDone(50000, 12000, 'Summarized older turns');
      component.setExpanded(true);
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).toContain('Summarized older turns');
      expect(text).toContain('Ctrl-O to hide compaction summary');
    } finally {
      component.dispose();
    }
  });

  it('collapses back to hide summary body on setExpanded(false)', () => {
    const component = new CompactionComponent(darkColors);

    try {
      component.markDone(50000, 12000, 'Summarized older turns');
      component.setExpanded(true);
      component.setExpanded(false);
      const lines = component.render(120).map(strip);
      const text = lines.join('\n');

      expect(text).not.toContain('Summarized older turns');
      expect(text).toContain('Ctrl-O to show compaction summary');
    } finally {
      component.dispose();
    }
  });

  it('is recognized as Expandable by isExpandable()', () => {
    const component = new CompactionComponent(darkColors);

    try {
      expect(isExpandable(component)).toBe(true);
    } finally {
      component.dispose();
    }
  });
});
