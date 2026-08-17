import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  MASKED_SECRET_PLACEHOLDER,
  configRevisionForText,
  maskConfigSecrets,
  readConfigDocument,
  restoreMaskedSecrets,
  validateConfigText,
  writeConfigDocument,
} from '#/config/document';
import { ErrorCodes, ByfError } from '#/errors';

let dir: string;
let file: string;

async function makeTempFile(): Promise<string> {
  dir = await mkdtemp(join(tmpdir(), 'byf-config-doc-'));
  file = join(dir, 'config.toml');
  return file;
}

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

const SAMPLE = `# demo config
default_model = "deepseek-chat"

[providers.deepseek]
type = "openai-completions"
base_url = "https://api.deepseek.com"
api_key = "sk-secret-123"

[models.deepseek-chat]
model = "deepseek-chat"
provider = "deepseek"
max_context_size = 65536
`;

describe('readConfigDocument', () => {
  test('missing file returns defaults + null revision + template text', async () => {
    const path = await makeTempFile();
    const doc = await readConfigDocument(path);
    expect(doc.revision).toBeNull();
    expect(doc.parsed.raw).toBeTruthy();
    expect(doc.text.length).toBeGreaterThan(0);
  });

  test('existing file returns raw text + sha256 revision + parsed', async () => {
    const path = await makeTempFile();
    await writeFile(path, SAMPLE, 'utf-8');
    const doc = await readConfigDocument(path);
    expect(doc.revision).toBe(configRevisionForText(SAMPLE));
    expect(doc.text).toBe(SAMPLE);
    expect(doc.parsed.raw).toBeTruthy();
  });
});

describe('validateConfigText', () => {
  test('valid TOML passes', async () => {
    const result = validateConfigText(SAMPLE, 'config.toml');
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toEqual([]);
  });

  test('invalid TOML reports syntax diagnostics', () => {
    const result = validateConfigText('not valid toml ===', 'config.toml');
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  test('schema-invalid config reports a diagnostic', () => {
    const result = validateConfigText('default_model = 12345', 'config.toml');
    expect(result.valid).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe('writeConfigDocument', () => {
  test('writes raw text verbatim (comments preserved) and returns new revision', async () => {
    const path = await makeTempFile();
    await writeFile(path, SAMPLE, 'utf-8');
    const edited = SAMPLE + '\n# appended comment\n';
    const { revision } = await writeConfigDocument(path, edited, configRevisionForText(SAMPLE));
    expect(revision).toBe(configRevisionForText(edited));
    expect(await readFile(path, 'utf-8')).toBe(edited);
  });

  test('conflicting revision throws CONFIG_REVISION_CONFLICT without touching disk', async () => {
    const path = await makeTempFile();
    await writeFile(path, SAMPLE, 'utf-8');
    const stale = configRevisionForText('older content');
    try {
      await writeConfigDocument(path, '# new', stale);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ByfError).code).toBe(ErrorCodes.CONFIG_REVISION_CONFLICT);
    }
    expect(await readFile(path, 'utf-8')).toBe(SAMPLE);
  });

  test('creating a missing file with expectedRevision null succeeds', async () => {
    const path = await makeTempFile();
    const { revision } = await writeConfigDocument(path, '# fresh\n', null);
    expect(revision).toBeTruthy();
    expect(await readFile(path, 'utf-8')).toBe('# fresh\n');
  });

  test('invalid text is rejected before writing (422 语义)', async () => {
    const path = await makeTempFile();
    await writeFile(path, SAMPLE, 'utf-8');
    try {
      await writeConfigDocument(path, 'default_model = 999', configRevisionForText(SAMPLE));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as ByfError).code).toBe(ErrorCodes.CONFIG_INVALID);
    }
    expect(await readFile(path, 'utf-8')).toBe(SAMPLE);
  });
});

describe('maskConfigSecrets / restoreMaskedSecrets', () => {
  test('masks api_key values and restores them verbatim', () => {
    const masked = maskConfigSecrets(SAMPLE);
    expect(masked).toContain(MASKED_SECRET_PLACEHOLDER);
    expect(masked).not.toContain('sk-secret-123');
    const restored = restoreMaskedSecrets(masked, SAMPLE);
    expect(restored).toBe(SAMPLE);
  });

  test('user replacement value is kept; deleted masked line deletes the key', () => {
    const masked = maskConfigSecrets(SAMPLE);
    const edited = masked.replace(`"${MASKED_SECRET_PLACEHOLDER}"`, '"new-secret"');
    const restored = restoreMaskedSecrets(edited, SAMPLE);
    expect(restored).toContain('new-secret');
    expect(restored).not.toContain('sk-secret-123');

    const deleted = masked
      .split('\n')
      .filter((l) => !l.includes('api_key'))
      .join('\n');
    const restoredDeleted = restoreMaskedSecrets(deleted, SAMPLE);
    expect(restoredDeleted).not.toContain('sk-secret-123');
    expect(restoredDeleted).not.toContain('api_key');
  });
});
