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

  test('edge cases: comment lines and non-secret strings are not touched; single quotes masked', () => {
    const t = `[providers.a]
api_key = "secret-1"
# api_key = "commented-out"
note = "api_key = \\"not-a-secret\\""
[providers.b]
api_key = 'secret-2'
`;
    const masked = maskConfigSecrets(t);
    expect(masked).not.toContain('secret-1');
    expect(masked).not.toContain('secret-2');
    expect(masked).toContain('commented-out'); // 注释行不动
    expect(masked).toContain('not-a-secret'); // 非 api_key 行不动
    expect(restoreMaskedSecrets(masked, t)).toBe(t);
  });

  test('camelCase apiKey values are masked too (R-E6: api_key/apiKey 均不跨线)', () => {
    const t = '[providers.d]\napiKey = "camel-secret"\n';
    const masked = maskConfigSecrets(t);
    expect(masked).not.toContain('camel-secret');
    expect(restoreMaskedSecrets(masked, t)).toBe(t);
  });

  test('user replacement value is kept; deleted masked line deletes the key', () => {
    const masked = maskConfigSecrets(SAMPLE);
    const edited = masked.replaceAll(/"__BYF_KEEP_SECRET__(?:_\d+)?"/g, '"new-secret"');
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
    expect(restoredDeleted).not.toContain('api_key');
  });
});

describe('mask/restore 多 key 与数组（review 回归：错位与泄漏修复）', () => {
  const MULTI = `[providers.a]
api_key = "sk-a"
[providers.b]
api_key = "sk-b"
[providers.c]
api_key = "sk-c"
`;

  test('deleting the first masked key does not remap later keys (序号占位符)', () => {
    const masked = maskConfigSecrets(MULTI);
    // 用户删除第一行 api_key（保留 b/c 的占位符）
    const edited = masked
      .split('\n')
      .filter((l) => !l.includes('api_key = "__BYF_KEEP_SECRET___1"'))
      .join('\n');
    const restored = restoreMaskedSecrets(edited, MULTI);
    expect(restored).toContain('sk-b');
    expect(restored).toContain('sk-c');
    expect(restored).not.toContain('sk-a');
    expect(restored).not.toContain('__BYF_KEEP_SECRET__');
  });

  test('reordering rows keeps each placeholder anchored to its disk value', () => {
    const masked = maskConfigSecrets(MULTI);
    // 交换 b/c 两行（值仍带序号）
    const lines = masked.split('\n');
    const idxB = lines.findIndex((l) => l.includes('__BYF_KEEP_SECRET___2'));
    const idxC = lines.findIndex((l) => l.includes('__BYF_KEEP_SECRET___3'));
    [lines[idxB], lines[idxC]] = [lines[idxC]!, lines[idxB]!];
    const restored = restoreMaskedSecrets(lines.join('\n'), MULTI);
    // 序号锚定：值跟随占位符行（交换后 b 区那行是原 c 的占位符 3 → sk-c）。
    const rows = restored.split('\n');
    const bVal = rows[rows.findIndex((l) => l.includes('[providers.b]')) + 1]!;
    const cVal = rows[rows.findIndex((l) => l.includes('[providers.c]')) + 1]!;
    expect(bVal).toContain('sk-c');
    expect(cVal).toContain('sk-b');
    expect(restored).not.toContain('__BYF_KEEP_SECRET__');
  });

  test('api_keys array values are masked and restored (web search 密钥数组)', () => {
    const t = `[services.web_search.providers.brave]
api_keys = ["sk-arr-1", "sk-arr-2"]
`;
    const masked = maskConfigSecrets(t);
    expect(masked).not.toContain('sk-arr-1');
    expect(masked).not.toContain('sk-arr-2');
    expect(restoreMaskedSecrets(masked, t)).toBe(t);
  });

  test('trailing comments survive masking (AC-A6 全保真)', () => {
    const t = `[providers.a]
api_key = "sk-c" # production key
`;
    const masked = maskConfigSecrets(t);
    expect(masked).toContain('# production key');
    expect(masked).not.toContain('sk-c');
    expect(restoreMaskedSecrets(masked, t)).toBe(t);
  });
});
