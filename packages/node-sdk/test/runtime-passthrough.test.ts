import type { RuntimeConfig } from '@byfriends/agent-core';
import { localKaos } from '@byfriends/kaos';
import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness } from '#/index';

import { makeTempDir, removeTempDirs } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

function testRuntime(): RuntimeConfig {
  return {
    kaos: localKaos,
    osEnv: {
      osKind: 'linux',
      osArch: 'x86_64',
      osVersion: '24.04',
      shellName: 'bash',
      shellPath: '/bin/bash',
    },
  };
}

describe('ByfHarness runtime passthrough (PRD-0009 #158)', () => {
  it('accepts a custom runtime and creates a session without error', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-runtime-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-runtime-');
    const harness = new ByfHarness({
      homeDir,
      identity: TEST_IDENTITY,
      runtime: testRuntime(),
    });
    try {
      const session = await harness.createSession({ workDir });
      expect(session.id).toBeTruthy();
    } finally {
      await harness.close();
    }
  });

  it('defaults to localKaos when runtime is not provided', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-runtime-default-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-runtime-default-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });
    try {
      const session = await harness.createSession({ workDir });
      expect(session.id).toBeTruthy();
    } finally {
      await harness.close();
    }
  });
});
