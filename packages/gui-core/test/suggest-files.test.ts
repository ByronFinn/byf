import { describe, it, expect } from 'vitest';
import { suggestFiles } from '../src/workspace/suggest-files';

describe('suggestFiles', () => {
  it('returns empty array for non-existent directory', async () => {
    const result = await suggestFiles({ workDir: '/nonexistent/path' });
    expect(result.files).toEqual([]);
  });

  it('returns recent files for empty query in a real directory', async () => {
    const result = await suggestFiles({ workDir: process.cwd() });
    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files[0]).toHaveProperty('path');
    expect(result.files[0]).toHaveProperty('name');
    expect(result.files[0]).toHaveProperty('score');
  });

  it('filters files by query substring', async () => {
    const result = await suggestFiles({
      workDir: process.cwd(),
      query: 'suggest',
    });
    for (const file of result.files) {
      // At least one of name or path should contain 'suggest'
      const lowerName = file.name.toLowerCase();
      const lowerPath = file.path.toLowerCase();
      expect(
        lowerName.includes('suggest') || lowerPath.includes('suggest')
      ).toBe(true);
    }
  });

  it('returns limited results with empty query (max 15)', async () => {
    const result = await suggestFiles({ workDir: process.cwd() });
    expect(result.files.length).toBeLessThanOrEqual(15);
  });

  it('returns more results with non-empty query (max 50)', async () => {
    const result = await suggestFiles({
      workDir: process.cwd(),
      query: 'a',
    });
    expect(result.files.length).toBeLessThanOrEqual(50);
  });
});
