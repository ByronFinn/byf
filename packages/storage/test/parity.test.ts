import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSessionStorageContractTests } from '@byfriends/agent-core/harness/storage-contract';
import { afterAll, describe } from 'vitest';

import { SqliteSessionStorage } from '../src/sqlite-storage';

/** PRD-0037 #337：SQLite 后端 parity（AC9——同一契约套件全绿）。 */
const tempDirs: string[] = [];

describe('SqliteSessionStorage (contract parity)', () => {
  runSessionStorageContractTests({
    make: async () => {
      const dir = await mkdtemp(join(tmpdir(), 'byf-sqlite-'));
      tempDirs.push(dir);
      return SqliteSessionStorage.open(join(dir, 'sessions.db'), 'sqlite-contract');
    },
  });
});

afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});
