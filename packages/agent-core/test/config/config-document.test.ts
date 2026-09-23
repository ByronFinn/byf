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
    const edited = masked.replaceAll(/"__BYF_KEEP_SECRET__[^"]*"/g, '"new-secret"');
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

  test('deleting the first masked key does not remap later keys (占位符按键路径自描述)', () => {
    const masked = maskConfigSecrets(MULTI);
    // 用户删除第一行 api_key（保留 b/c 的占位符）
    const lines = masked.split('\n');
    const firstKeyRow = lines.findIndex((l) =>
      l.startsWith(`api_key = "${MASKED_SECRET_PLACEHOLDER}`),
    );
    const restored = restoreMaskedSecrets(
      lines.filter((_, index) => index !== firstKeyRow).join('\n'),
      MULTI,
    );
    expect(restored).toContain('sk-b');
    expect(restored).toContain('sk-c');
    expect(restored).not.toContain('sk-a');
    expect(restored).not.toContain('__BYF_KEEP_SECRET__');
  });

  // 契约变更（PRD-0038 AC-1.5）：占位符的身份是它标注的键路径，不是它排第几行。
  // 旧用例断言「行交换后值随行走」的原因是序号写死在占位符文本里；新语义下值仍
  // 随行移动，但依据是行内标注的 `providers.x.api_key` 路径——所以这里改为按标注
  // 路径定位行，并额外钉住「归属由标注路径决定」（整块重排的用例见 AC-1.5 describe）。
  test('each placeholder is anchored to the key path it names, not to its row', () => {
    const masked = maskConfigSecrets(MULTI);
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.b.api_key`);
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.c.api_key`);
    // 交换 b/c 两行（标注路径跟着行一起走）
    const rows = masked.split('\n');
    const idxB = rows.findIndex((l) =>
      l.includes(`${MASKED_SECRET_PLACEHOLDER}providers.b.api_key`),
    );
    const idxC = rows.findIndex((l) =>
      l.includes(`${MASKED_SECRET_PLACEHOLDER}providers.c.api_key`),
    );
    const rowB = rows[idxB];
    const rowC = rows[idxC];
    if (rowB === undefined || rowC === undefined) {
      throw new Error('expected one masked row per anchored key path');
    }
    [rows[idxB], rows[idxC]] = [rowC, rowB];
    const restored = restoreMaskedSecrets(rows.join('\n'), MULTI);
    // 值跟随它标注的键路径：落在 [providers.b] 下的那行标注 providers.c → sk-c；
    // 每个磁盘密钥恰好被引用一次，既不丢也不复制到别处。
    const lines = restored.split('\n');
    const bVal = lines[lines.findIndex((l) => l.includes('[providers.b]')) + 1];
    const cVal = lines[lines.findIndex((l) => l.includes('[providers.c]')) + 1];
    expect(bVal).toContain('sk-c');
    expect(cVal).toContain('sk-b');
    expect(restored.match(/sk-a/g)).toHaveLength(1);
    expect(restored.match(/sk-b/g)).toHaveLength(1);
    expect(restored.match(/sk-c/g)).toHaveLength(1);
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

// ---- PRD-0038 AC-1.5:占位符身份必须与行序解耦(按键路径而非出现序号还原) ----
// 数组密钥块刻意排在标量 provider 之前:任何按行序/共享计数编号占位符的实现
// 都会在标量还原时错位或静默丢键。

describe('PRD-0038 AC-1.5 placeholder identity decoupled from line order', () => {
  const MIXED = `# fixture
[services.web_search.providers.brave]
api_keys = ["brave-1", "brave-2"]

[providers.a]
type = "anthropic"
api_key = "sk-aaa"

[providers.b]
type = "anthropic"
api_key = "sk-bbb"

[providers.c]
type = "anthropic"
api_key = "sk-ccc"
`;

  function splitBlocks(text: string): { prefix: string; blocks: string[] } {
    const lines = text.split('\n');
    const blocks: string[] = [];
    const prefixLines: string[] = [];
    let current: string[] | undefined;
    for (const line of lines) {
      if (line.startsWith('[')) {
        if (current !== undefined) blocks.push(current.join('\n'));
        current = [line];
      } else if (current === undefined) {
        prefixLines.push(line);
      } else {
        current.push(line);
      }
    }
    if (current !== undefined) blocks.push(current.join('\n'));
    return { prefix: prefixLines.join('\n'), blocks };
  }

  const headerOf = (block: string): string => block.split('\n')[0] ?? '';

  function providerKeyValues(text: string): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const block of splitBlocks(text).blocks) {
      const match = /^\[providers\.([^\]]+)\]$/.exec(headerOf(block));
      if (match === null) continue;
      out[match[1]!] = /^api_key = "(.*?)"\s*(?:#.*)?$/m.exec(block)?.[1];
    }
    return out;
  }

  test('identity round trip keeps every scalar key with an array block present (行序 seq 丢键)', () => {
    const masked = maskConfigSecrets(MIXED);
    expect(masked).not.toContain('sk-aaa');
    const restored = restoreMaskedSecrets(masked, MIXED);
    expect(providerKeyValues(restored)).toEqual({ a: 'sk-aaa', b: 'sk-bbb', c: 'sk-ccc' });
    expect(restored).toContain('"brave-1"');
    expect(restored).not.toContain('__BYF_KEEP_SECRET__');
  });

  test('reordering provider blocks keeps each key under its own provider', () => {
    const masked = maskConfigSecrets(MIXED);
    const { prefix, blocks } = splitBlocks(masked);
    const byHeader = new Map(blocks.map((b) => [headerOf(b), b]));
    const reordered = ['[providers.c]', '[providers.a]', '[providers.b]']
      .map((h) => byHeader.get(h))
      .filter((b): b is string => b !== undefined);
    const restored = restoreMaskedSecrets(joinAll(prefix, reordered, byHeader), MIXED);
    expect(providerKeyValues(restored)).toEqual({ a: 'sk-aaa', b: 'sk-bbb', c: 'sk-ccc' });
    expect(restored).not.toContain('__BYF_KEEP_SECRET__');
  });

  function joinAll(
    prefix: string,
    reorderedProviders: string[],
    byHeader: Map<string, string>,
  ): string {
    const arrayBlock = byHeader.get('[services.web_search.providers.brave]');
    expect(arrayBlock).toBeDefined();
    return [prefix, arrayBlock!, ...reorderedProviders].join('\n');
  }

  test('deleting one provider block loses only that block keys', () => {
    const masked = maskConfigSecrets(MIXED);
    const { prefix, blocks } = splitBlocks(masked);
    const kept = blocks.filter((b) => headerOf(b) !== '[providers.b]');
    const restored = restoreMaskedSecrets([prefix, ...kept].join('\n'), MIXED);
    const values = providerKeyValues(restored);
    expect(values['a']).toBe('sk-aaa');
    expect(values['c']).toBe('sk-ccc');
    expect(values['b']).toBeUndefined();
    expect(restored).not.toContain('sk-bbb');
    expect(restored).toContain('"brave-2"');
  });

  test('placeholder whose key path has no disk value must throw (不静默复制/丢键)', () => {
    const masked = maskConfigSecrets(MIXED);
    const { blocks } = splitBlocks(masked);
    const blockA = blocks.find((b) => headerOf(b) === '[providers.a]');
    expect(blockA).toBeDefined();
    // 把 a 的掩码行整体粘贴到磁盘上不存在的 [providers.d]:占位符无法按键
    // 路径解析 → 必须抛可诊断错误,而不是复制 a 的值或静默删行。
    const maskedKeyRow = blockA!.split('\n').find((row) => row.includes(MASKED_SECRET_PLACEHOLDER));
    expect(maskedKeyRow).toBeDefined();
    const grown = `${masked}\n[providers.d]\ntype = "anthropic"\n${maskedKeyRow}\n`;
    expect(() => restoreMaskedSecrets(grown, MIXED)).toThrow();
  });

  test('explicit new literal key is accepted (总数变化的合法一侧)', () => {
    const masked = maskConfigSecrets(MIXED);
    const appended = `${masked}\n[providers.d]\ntype = "anthropic"\napi_key = "sk-new-d"\n`;
    const restored = restoreMaskedSecrets(appended, MIXED);
    expect(providerKeyValues(restored)).toEqual({
      a: 'sk-aaa',
      b: 'sk-bbb',
      c: 'sk-ccc',
      d: 'sk-new-d',
    });
  });
});

// ---- PRD-0038 AC-1.8:非 table-header 形态的密钥同样不得以明文过线 ----------
// 掩码器过去只认「表头 + 行首 api_key/api_keys」两种形态。`providers.x.api_key = "…"`
// 这种点号写法（以及表头内的点号续写）从不被掩码 → raw GET 把明文密钥送出进程。
// 判据：能归一化成键路径身份的必须掩码；连身份都给不出的形态必须拒绝外发。

describe('PRD-0038 AC-1.8 every secret shape is masked or refused, never plaintext', () => {
  const DOTTED_TOP_LEVEL = `# TOML 点号键:整份文件没有任何 table header
providers.deepseek.type = "openai-completions"
providers.deepseek.api_key = "sk-dotted-1"
services.web_search.providers.brave.api_keys = ["brave-a", "brave-b"]
`;

  test('top-level dotted scalar key is masked with its key path', () => {
    const masked = maskConfigSecrets(DOTTED_TOP_LEVEL);
    expect(masked).not.toContain('sk-dotted-1');
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.deepseek.api_key"`);
  });

  test('top-level dotted array key is masked per element with indexed key path', () => {
    const masked = maskConfigSecrets(DOTTED_TOP_LEVEL);
    expect(masked).not.toContain('brave-a');
    expect(masked).not.toContain('brave-b');
    expect(masked).toContain(
      `${MASKED_SECRET_PLACEHOLDER}services.web_search.providers.brave.api_keys[0]"`,
    );
    expect(masked).toContain(
      `${MASKED_SECRET_PLACEHOLDER}services.web_search.providers.brave.api_keys[1]"`,
    );
  });

  test('dotted scalar key inside a table header joins the header path', () => {
    const text = `[providers]
deepseek.api_key = "sk-in-table"
`;
    const masked = maskConfigSecrets(text);
    expect(masked).not.toContain('sk-in-table');
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.deepseek.api_key"`);
  });

  test('dotted forms normalize to the same identity as their table-header form', () => {
    const dotted = `[providers]
deepseek.api_key = "sk-same"
`;
    const header = `[providers.deepseek]
api_key = "sk-same"
`;
    // 身份 = 占位符里标注的键路径。两种写法必须标出同一个路径,否则同一密钥会因写法
    // 不同而归属不同,重排/改写形态时就会错配。
    const labelOf = (text: string): string =>
      new RegExp(`${MASKED_SECRET_PLACEHOLDER}([^"']*)"`).exec(maskConfigSecrets(text))?.[1] ?? '';
    expect(labelOf(dotted)).toBe('providers.deepseek.api_key');
    expect(labelOf(dotted)).toBe(labelOf(header));
  });

  test('dotted forms round trip byte-identically (mask → restore 不丢原值)', () => {
    expect(restoreMaskedSecrets(maskConfigSecrets(DOTTED_TOP_LEVEL), DOTTED_TOP_LEVEL)).toBe(
      DOTTED_TOP_LEVEL,
    );
    const inTable = `[providers]
deepseek.api_key = "sk-in-table"
`;
    expect(restoreMaskedSecrets(maskConfigSecrets(inTable), inTable)).toBe(inTable);
  });

  test('camelCase dotted key keeps the canonical snake identity (R-E6 等价)', () => {
    const text = `providers.deepseek.apiKey = "sk-camel"\n`;
    const masked = maskConfigSecrets(text);
    expect(masked).not.toContain('sk-camel');
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.deepseek.api_key"`);
    expect(restoreMaskedSecrets(masked, text)).toBe(text);
  });

  test('secret value the walker cannot anchor (inline table) is refused, not echoed', () => {
    const text = `providers = { deepseek = { api_key = "sk-inline" } }\n`;
    expect(() => maskConfigSecrets(text)).toThrow(ByfError);
    expect(() => maskConfigSecrets(text)).toThrow(/line\(s\) 1/);
  });

  test('multi-line array secret is refused instead of leaking its element lines', () => {
    const text = `[services.web_search.providers.brave]
api_keys = [
  "brave-1",
  "brave-2",
]
`;
    expect(() => maskConfigSecrets(text)).toThrow(ByfError);
    try {
      maskConfigSecrets(text);
    } catch (error) {
      expect(error).toBeInstanceOf(ByfError);
      expect((error as ByfError).code).toBe(ErrorCodes.CONFIG_INVALID);
      // 诊断必须点名行号与出路,且不回显任何密钥片段。
      expect((error as ByfError).message).toContain('line(s) 2');
      expect((error as ByfError).message).not.toContain('brave-1');
    }
  });

  test('multi-line basic-string secret is refused', () => {
    const text = `[providers.a]
api_key = """
sk-multi-line
"""
`;
    expect(() => maskConfigSecrets(text)).toThrow(ByfError);
  });

  test('malformed single-line secret value is masked away so the repair path stays open', () => {
    // 引号未闭合是 config 损坏最常见的形态。AC-1.7 要求"损坏后经 web 修复"可达,
    // 因此这一类必须掩码掉明文（而不是拒绝整份文件），同时保留磁盘原值可还原。
    const broken = `[providers.a]
api_key = "sk-unterminated
`;
    const masked = maskConfigSecrets(broken);
    expect(masked).not.toContain('sk-unterminated');
    expect(masked).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.a.api_key"`);
    expect(restoreMaskedSecrets(masked, broken)).toBe(`[providers.a]
api_key = "sk-unterminated
`);
  });

  test('unquoted secret value is masked away too', () => {
    const text = `[providers.a]
api_key = sk-bare
`;
    const masked = maskConfigSecrets(text);
    expect(masked).not.toContain('sk-bare');
    expect(restoreMaskedSecrets(masked, text)).toBe(text);
  });

  test('non-secret lines that merely mention a key name are untouched', () => {
    const text = `[providers.a]
# note: my_api_key = "sk-comment" is only prose
base_url = "https://example.invalid/v1"
`;
    expect(maskConfigSecrets(text)).toBe(text);
  });
});
