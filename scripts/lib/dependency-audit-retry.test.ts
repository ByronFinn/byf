/**
 * PRD-0038 AC-5.2 — the OSV query's retry policy, and the three outcomes that
 * must stay distinguishable: recovered, permanently failed, and fail-closed.
 *
 * F5.4: this file used to burn 3.53s of real wall clock because `queryOsv` let a
 * test inject `fetchImpl` but not the backoff sleep, so the only way to observe a
 * retry was to wait for it. The sleep is injected now, and the assertions are
 * about attempt counts and the recorded backoff schedule — never elapsed time.
 */

import { describe, expect, it } from 'vitest';

import type { LockedPackage, OsvQueryOptions } from './check-dependency-audit.mjs';
import { queryOsv } from './check-dependency-audit.mjs';

type OsvFetchResponse = Awaited<ReturnType<NonNullable<OsvQueryOptions['fetchImpl']>>>;

/**
 * A locked package needs its `source` (the tarball URL `bun.lock` records), which is
 * what the provenance half of the gate reads. `queryOsv` itself only sends
 * name/version, so the retry assertions below are unaffected by the value.
 */
const PACKAGES: readonly LockedPackage[] = [
  {
    name: 'left-pad',
    version: '1.3.0',
    source: 'https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz',
  },
];

/** The OSV constants the retry loop is written against, mirrored on purpose. */
const ATTEMPTS_PER_PACKAGE = 3;
const BACKOFF_STEP_MS = 500;

function okResponse(id: string): OsvFetchResponse {
  return {
    status: 200,
    ok: true,
    json: async () => ({ vulns: [{ id, aliases: [], severity: [], summary: 'x' }] }),
  };
}

function failResponse(status: number): OsvFetchResponse {
  return { status, ok: false, json: async () => ({ vulns: [] }) };
}

/** A `sleep` that records instead of waiting, so no test pays wall clock. */
function recordingSleep() {
  const scheduled: number[] = [];
  return {
    scheduled,
    sleep: async (ms: number): Promise<void> => {
      scheduled.push(ms);
    },
  };
}

describe('OSV query retry (PRD-0038 AC-5.2)', () => {
  it('recovers from a transient failure without counting an error', async () => {
    let calls = 0;
    const sleep = recordingSleep();
    const fetchImpl = async (): Promise<OsvFetchResponse> => {
      calls += 1;
      if (calls < 3) throw new Error('socket hang up');
      return okResponse('GHSA-transient');
    };
    const result = await queryOsv(PACKAGES, {
      fetchImpl,
      concurrency: 1,
      sleep: sleep.sleep,
    });
    expect(result.errors).toBe(0);
    expect(result.advisories.map((a) => a.id)).toEqual(['GHSA-transient']);
    expect(calls).toBe(3);
    // Linear backoff between the three attempts, and nothing after the last one.
    expect(sleep.scheduled).toEqual([1 * BACKOFF_STEP_MS, 2 * BACKOFF_STEP_MS]);
  });

  it('stays fail-closed when the query never succeeds', async () => {
    let calls = 0;
    const sleep = recordingSleep();
    const fetchImpl = async (): Promise<never> => {
      calls += 1;
      throw new Error('offline');
    };
    const result = await queryOsv(PACKAGES, {
      fetchImpl,
      concurrency: 1,
      sleep: sleep.sleep,
    });
    expect(result.errors).toBe(1);
    expect(result.advisories).toEqual([]);
    // Attempts are capped: a hanging endpoint cannot make this loop spin forever.
    expect(calls).toBe(ATTEMPTS_PER_PACKAGE);
    expect(sleep.scheduled.length).toBe(ATTEMPTS_PER_PACKAGE - 1);
  });

  it('does not retry a permanent client error', async () => {
    let calls = 0;
    const sleep = recordingSleep();
    const fetchImpl = async (): Promise<OsvFetchResponse> => {
      calls += 1;
      return failResponse(404);
    };
    const result = await queryOsv(PACKAGES, {
      fetchImpl,
      concurrency: 1,
      sleep: sleep.sleep,
    });
    expect(result.errors).toBe(1);
    expect(calls).toBe(1);
    expect(sleep.scheduled).toEqual([]);
  });

  it('retries a rate limit response', async () => {
    let calls = 0;
    const sleep = recordingSleep();
    const fetchImpl = async (): Promise<OsvFetchResponse> => {
      calls += 1;
      if (calls === 1) return failResponse(429);
      return okResponse('GHSA-after-429');
    };
    const result = await queryOsv(PACKAGES, {
      fetchImpl,
      concurrency: 1,
      sleep: sleep.sleep,
    });
    expect(result.errors).toBe(0);
    expect(result.advisories.map((a) => a.id)).toEqual(['GHSA-after-429']);
    expect(calls).toBe(2);
    expect(sleep.scheduled).toEqual([1 * BACKOFF_STEP_MS]);
  });

  it('retries a 5xx the same way as a connection error', async () => {
    let calls = 0;
    const sleep = recordingSleep();
    const fetchImpl = async (): Promise<OsvFetchResponse> => {
      calls += 1;
      if (calls === 1) return failResponse(503);
      return okResponse('GHSA-after-503');
    };
    const result = await queryOsv(PACKAGES, {
      fetchImpl,
      concurrency: 1,
      sleep: sleep.sleep,
    });
    expect(result.errors).toBe(0);
    expect(calls).toBe(2);
    expect(sleep.scheduled).toEqual([1 * BACKOFF_STEP_MS]);
  });
});
