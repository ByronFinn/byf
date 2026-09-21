import { describe, expect, it } from 'vitest';

import { queryOsv } from './check-dependency-audit.mjs';

const PACKAGES = [{ name: 'left-pad', version: '1.3.0' }];

function okResponse(id) {
  return {
    status: 200,
    ok: true,
    json: async () => ({ vulns: [{ id, aliases: [], severity: [], summary: 'x' }] }),
  };
}

describe('OSV query retry (PRD-0038 AC-5.2)', () => {
  it('recovers from a transient failure without counting an error', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) throw new Error('socket hang up');
      return okResponse('GHSA-transient');
    };
    const result = await queryOsv(PACKAGES, { fetchImpl, concurrency: 1 });
    expect(result.errors).toBe(0);
    expect(result.advisories.map((a) => a.id)).toEqual(['GHSA-transient']);
    expect(calls).toBe(3);
  });

  it('stays fail-closed when the query never succeeds', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error('offline');
    };
    const result = await queryOsv(PACKAGES, { fetchImpl, concurrency: 1 });
    expect(result.errors).toBe(1);
    expect(calls).toBe(3);
  });

  it('does not retry a permanent client error', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return { status: 404, ok: false };
    };
    const result = await queryOsv(PACKAGES, { fetchImpl, concurrency: 1 });
    expect(result.errors).toBe(1);
    expect(calls).toBe(1);
  });

  it('retries a rate limit response', async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) return { status: 429, ok: false };
      return okResponse('GHSA-after-429');
    };
    const result = await queryOsv(PACKAGES, { fetchImpl, concurrency: 1 });
    expect(result.errors).toBe(0);
    expect(result.advisories.map((a) => a.id)).toEqual(['GHSA-after-429']);
  });
});
