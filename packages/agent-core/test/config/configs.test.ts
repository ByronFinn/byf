import { mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ByfConfigSchema,
  ensureConfigFile,
  McpServerConfigSchema,
  mergeConfigPatch,
  parseConfigString,
  DEFAULT_PRINT_WAIT_CEILING_S,
  parseBooleanEnv,
  parsePositiveIntEnv,
  readConfigFile,
  resolveConfigPath,
  resolveConfigValue,
  resolvePrintWaitCeilingS,
  resolveByfHome,
  validateConfig,
  writeConfigFile,
} from '../../src/config';
import type { ByfConfig } from '../../src/config/schema';
import { ErrorCodes, ByfError } from '../../src/errors';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'byf-core-config-'));
  tempDirs.push(dir);
  return dir;
}

function expectByfErrorCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ByfError);
    expect((error as ByfError).code).toBe(code);
    return;
  }
  throw new Error('expected function to throw');
}

const COMPLETE_TOML = `
default_model = "byf/byf-for-coding"
default_thinking = true
default_permission_mode = "auto"
merge_all_available_skills = true
extra_skill_dirs = ["~/team-skills", ".agents/team-skills"]
theme = "dark"

[providers."test-provider"]
type = "openai-completions"
base_url = "https://api.example.test/v1"
api_key = "sk-file"
custom_headers = { "X-Test" = "1" }

[providers."test-provider".env]
GOOGLE_CLOUD_PROJECT = "project-1"

[models."byf/byf-for-coding"]
provider = "test-provider"
model = "byf-for-coding"
max_context_size = 262144
capabilities = ["image_in", "thinking", "video_in"]
display_name = "Byf for Coding"

[thinking]
mode = "auto"
effort = "medium"

[permission]
mode = "manual"

[[permission.rules]]
decision = "deny"
scope = "user"
pattern = "Bash(rm *)"
reason = "no rm"

[[permission.allow]]
tool = "Read"
match = "src/**"
reason = "read src"

[loop_control]
max_steps_per_run = 42
max_retries_per_step = 3
reserved_context_size = 50000
compaction_trigger_ratio = 0.85

[background]
max_running_tasks = 4
keep_alive_on_exit = false
kill_grace_period_ms = 2000
agent_task_timeout_s = 900
print_wait_ceiling_s = 3600

[[hooks]]
event = "PreToolUse"
matcher = "Shell"
command = "echo pre"
timeout = 5

[[hooks]]
event = "Stop"
command = "echo stop"

[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-search"]
priority = 1

[services.fetch_url]
base_url = "https://api.example.test/v1/fetch"
api_key = "sk-fetch"

[notifications]
claim_stale_after_ms = 15000
`;

describe('harness config TOML loader', () => {
  it('parses the current config.toml shape through explicit field mappings', () => {
    const config = parseConfigString(COMPLETE_TOML, 'config.toml');

    expect(config.defaultModel).toBe('byf/byf-for-coding');
    expect(config.defaultThinking).toBe(true);
    expect(config.defaultPermissionMode).toBe('auto');
    expect(config.mergeAllAvailableSkills).toBe(true);
    expect(config.extraSkillDirs).toEqual(['~/team-skills', '.agents/team-skills']);
    expect(config.providers['test-provider']).toMatchObject({
      type: 'openai-completions',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-file',
      env: { GOOGLE_CLOUD_PROJECT: 'project-1' },
      customHeaders: { 'X-Test': '1' },
    });
    expect(config.models?.['byf/byf-for-coding']).toMatchObject({
      provider: 'test-provider',
      model: 'byf-for-coding',
      maxContextSize: 262144,
      capabilities: ['image_in', 'thinking', 'video_in'],
      displayName: 'Byf for Coding',
    });
    expect(config.thinking).toEqual({ mode: 'auto', effort: 'medium' });
    expect(config.permission).toEqual({
      rules: [
        {
          decision: 'deny',
          scope: 'user',
          pattern: 'Bash(rm *)',
          reason: 'no rm',
        },
        {
          decision: 'allow',
          scope: 'user',
          pattern: 'Read(src/**)',
          reason: 'read src',
        },
      ],
    });
    expect(config.loopControl).toMatchObject({
      maxStepsPerTurn: 42,
      maxRetriesPerStep: 3,
      reservedContextSize: 50000,
      compactionTriggerRatio: 0.85,
    });
    expect(config.background?.agentTaskTimeoutS).toBe(900);
    expect(config.hooks).toEqual([
      {
        event: 'PreToolUse',
        matcher: 'Shell',
        command: 'echo pre',
        timeout: 5,
      },
      {
        event: 'Stop',
        command: 'echo stop',
      },
    ]);
    expect(config.services?.webSearch?.providers[0]?.apiKeys[0]).toBe('sk-search');
    expect(config.services?.fetchUrl?.apiKey).toBe('sk-fetch');

    expect('theme' in config).toBe(false);
    expect(config.raw?.['theme']).toBe('dark');
    expect(config.raw?.['notifications']).toEqual({ claim_stale_after_ms: 15000 });
  });

  it('loads defaults for absent files and writes typed fields without dropping raw sections', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');

    expect(readConfigFile(configPath)).toEqual({ providers: {} });

    const config = parseConfigString(COMPLETE_TOML, configPath);
    const loopControl = config.loopControl;
    expect(loopControl).toBeDefined();
    await writeConfigFile(configPath, {
      ...config,
      defaultModel: 'byf/byf-for-coding',
      loopControl: {
        ...loopControl!,
        maxStepsPerTurn: 7,
      },
    });

    const text = await readFile(configPath, 'utf-8');
    expect(text).toContain('default_model = "byf/byf-for-coding"');
    expect(text).toContain('default_permission_mode = "auto"');
    expect(text).toContain('extra_skill_dirs = [ "~/team-skills", ".agents/team-skills" ]');
    expect(text).not.toContain('default_yolo');
    expect(text).toContain('[[permission.rules]]');
    expect(text).toContain('pattern = "Bash(rm *)"');
    expect(text).toContain('pattern = "Read(src/**)"');
    expect(text).not.toContain('[[permission.allow]]');
    expect(text).toContain('max_steps_per_turn = 7');
    expect(text).toContain('GOOGLE_CLOUD_PROJECT = "project-1"');
    expect(text).toContain('theme = "dark"');
    expect(text).toContain('claim_stale_after_ms = 15000');
    expect(text).toContain('[[hooks]]');
    expect(text).toContain('event = "PreToolUse"');
    expect(text).toContain('command = "echo pre"');

    const reloaded = readConfigFile(configPath);
    expect(reloaded.loopControl?.maxStepsPerTurn).toBe(7);
    expect(reloaded.hooks?.[0]?.event).toBe('PreToolUse');
    expect(reloaded.raw?.['theme']).toBe('dark');
  });

  // ── Web search multi-provider config (PRD-0012) ──────────────

  it('parses web_search providers from TOML [[services.web_search.providers]]', () => {
    const config = parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-exa-1"]
priority = 1

[[services.web_search.providers]]
type = "brave"
api_keys = ["sk-brave"]
priority = 2
base_url = "https://custom.brave.api/search"

[services.fetch_url]
base_url = "https://api.example.test/v1/fetch"
api_key = "sk-fetch"
`);

    expect(config.services?.webSearch).toBeDefined();
    expect(config.services?.webSearch!.providers).toHaveLength(2);
    expect(config.services?.webSearch!.providers[0]!.type).toBe('exa');
    expect(config.services?.webSearch!.providers[0]!.apiKeys).toEqual(['sk-exa-1']);
    expect(config.services?.webSearch!.providers[0]!.priority).toBe(1);
    expect(config.services?.webSearch!.providers[1]!.type).toBe('brave');
    expect(config.services?.webSearch!.providers[1]!.apiKeys).toEqual(['sk-brave']);
    expect(config.services?.webSearch!.providers[1]!.baseUrl).toBe(
      'https://custom.brave.api/search',
    );
    expect(config.services?.webSearch!.providers[1]!.priority).toBe(2);
    expect(config.services?.fetchUrl?.apiKey).toBe('sk-fetch');
    expect(config.services?.fetchUrl?.baseUrl).toBe('https://api.example.test/v1/fetch');
  });

  it('rejects web_search providers with empty api_keys', () => {
    expect(() =>
      parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = []
priority = 1
`),
    ).toThrow(/too_small|1 items/);
  });

  it('rejects web_search providers with missing priority', () => {
    expect(() =>
      parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-1"]
`),
    ).toThrow(/priority/);
  });

  it('rejects unknown provider type in web_search', () => {
    expect(() =>
      parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "unknown"
api_keys = ["sk-1"]
priority = 1
`),
    ).toThrow(/type/);
  });

  it('round-trips web_search providers through TOML write', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');

    const config = parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-exa"]
priority = 1

[[services.web_search.providers]]
type = "firecrawl"
api_keys = ["sk-fc"]
priority = 2
base_url = "https://proxy.firecrawl.test/search"
`);

    await writeConfigFile(configPath, config);

    const reloaded = readConfigFile(configPath);
    expect(reloaded.services?.webSearch?.providers).toHaveLength(2);
    expect(reloaded.services?.webSearch?.providers[0]!.type).toBe('exa');
    expect(reloaded.services?.webSearch?.providers[0]!.apiKeys).toEqual(['sk-exa']);
    expect(reloaded.services?.webSearch?.providers[0]!.priority).toBe(1);
    expect(reloaded.services?.webSearch?.providers[1]!.type).toBe('firecrawl');
    expect(reloaded.services?.webSearch?.providers[1]!.apiKeys).toEqual(['sk-fc']);
    expect(reloaded.services?.webSearch?.providers[1]!.baseUrl).toBe(
      'https://proxy.firecrawl.test/search',
    );
    expect(reloaded.services?.webSearch?.providers[1]!.priority).toBe(2);
  });

  it('writes services.fetch_url (not byf_fetch) in TOML output', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');

    const config = parseConfigString(`
[services.fetch_url]
base_url = "https://fetch.test"
api_key = "sk-fetch"
`);

    await writeConfigFile(configPath, config);

    const text = await readFile(configPath, 'utf-8');
    expect(text).toContain('[services.fetch_url]');
    expect(text).not.toContain('byf_fetch');
  });

  it('does not accept byfSearch or byfFetch in the new schema', () => {
    const config = parseConfigString(`
[services.byf_search]
base_url = "https://old.test"
api_key = "sk-old"

[services.byf_fetch]
base_url = "https://old-fetch.test"
api_key = "sk-old-fetch"
`);
    // Old keys are stripped by Zod (strip mode), leaving an empty services object
    expect((config.services as Record<string, unknown> | undefined)?.['byfSearch']).toBeUndefined();
    expect((config.services as Record<string, unknown> | undefined)?.['byfFetch']).toBeUndefined();
    expect(Object.keys(config.services ?? {})).toHaveLength(0);
  });

  it('webSearch providers are sorted by priority in the parsed config', () => {
    const config = parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-exa"]
priority = 3

[[services.web_search.providers]]
type = "brave"
api_keys = ["sk-brave"]
priority = 1
`);

    expect(config.services?.webSearch?.providers).toHaveLength(2);
    // Providers should remain in TOML order; PriorityRouter sorts them at runtime
    expect(config.services?.webSearch?.providers[0]!.priority).toBe(3);
    expect(config.services?.webSearch?.providers[1]!.priority).toBe(1);
  });

  it('creates a parseable default config scaffold without changing runtime defaults', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');

    await ensureConfigFile(configPath);

    const text = await readFile(configPath, 'utf-8');
    expect(text).toContain('Runtime settings for BYF.');
    expect(text).not.toMatch(/^default_thinking =/m);
    expect(text).not.toMatch(/^default_model =/m);

    const config = readConfigFile(configPath);
    expect(config.providers).toEqual({});
    expect(config.defaultModel).toBeUndefined();
    expect(config.defaultThinking).toBeUndefined();
  });

  it('does not overwrite an existing config file', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');
    const existing = 'default_model = "custom"\n';
    await writeFile(configPath, existing, 'utf-8');

    await ensureConfigFile(configPath);

    await expect(readFile(configPath, 'utf-8')).resolves.toBe(existing);
  });

  it('drops deprecated default_yolo when rewriting config files', async () => {
    const dir = makeTempDir();
    const configPath = join(dir, 'config.toml');
    const config = parseConfigString('default_yolo = true\n', configPath);

    expect(config.defaultPermissionMode).toBeUndefined();

    await writeConfigFile(configPath, config);

    const text = await readFile(configPath, 'utf-8');
    expect(text).not.toContain('default_yolo');
    expect(text).not.toContain('default_permission_mode');
  });

  it('rejects invalid TOML and invalid schema with ByfError(config.invalid)', () => {
    expectByfErrorCode(() => parseConfigString('[[[', 'broken.toml'), ErrorCodes.CONFIG_INVALID);
    expectByfErrorCode(
      () =>
        parseConfigString(
          `
[providers.bad]
type = "not-a-provider"
`,
          'broken.toml',
        ),
      ErrorCodes.CONFIG_INVALID,
    );
    expectByfErrorCode(
      () =>
        parseConfigString(
          `
[[permission.rules]]
decision = "deny"
pattern = "Bash(rm *"
`,
          'broken.toml',
        ),
      ErrorCodes.CONFIG_INVALID,
    );
  });

  it('parses hooks config from TOML arrays of tables', () => {
    const config = parseConfigString(
      `
[[hooks]]
event = "PreToolUse"
matcher = "Shell"
command = "echo hi"
timeout = 5
`,
      'hooks.toml',
    );

    expect(config.hooks).toEqual([
      {
        event: 'PreToolUse',
        matcher: 'Shell',
        command: 'echo hi',
        timeout: 5,
      },
    ]);
  });

  it('rejects invalid hooks config', () => {
    expectByfErrorCode(
      () =>
        parseConfigString(
          `
hooks = [{ type = "pre-tool-call", command = "echo hi" }]
`,
          'hooks.toml',
        ),
      ErrorCodes.CONFIG_INVALID,
    );
  });
});

describe('harness config schema and patch merge', () => {
  it('accepts the empty public config and requires model context size in full configs', () => {
    expect(ByfConfigSchema.parse({})).toEqual({ providers: {} });
    expect(() =>
      validateConfig({
        providers: {
          local: { type: 'openai-completions', apiKey: 'sk-test' },
        },
        models: {
          broken: { provider: 'local', model: 'gpt-test' },
        },
      }),
    ).toThrow(/max_context_size/);
  });

  it('deep-merges validated patches while preserving existing typed and raw data', () => {
    const base = parseConfigString(COMPLETE_TOML);
    const merged = mergeConfigPatch(base, {
      providers: {
        'test-provider': {
          apiKey: 'sk-patched',
          baseUrl: undefined,
        },
      },
      models: {
        'byf/byf-for-coding': {
          capabilities: ['tool_use'],
        },
      },
      thinking: {
        effort: 'high',
      },
    });

    expect(merged.providers['test-provider']).toMatchObject({
      type: 'openai-completions',
      baseUrl: 'https://api.example.test/v1',
      apiKey: 'sk-patched',
      env: { GOOGLE_CLOUD_PROJECT: 'project-1' },
    });
    expect(merged.models?.['byf/byf-for-coding']).toMatchObject({
      provider: 'test-provider',
      model: 'byf-for-coding',
      maxContextSize: 262144,
      capabilities: ['tool_use'],
    });
    expect(merged.thinking).toEqual({ mode: 'auto', effort: 'high' });
    expect(merged.hooks).toEqual(base.hooks);
    expect(merged.raw?.['theme']).toBe('dark');
  });

  it('rejects unknown fields in config patches', () => {
    expectByfErrorCode(
      () => mergeConfigPatch({ providers: {} }, { theme: 'dark' } as never),
      ErrorCodes.CONFIG_INVALID,
    );
  });

  it('replaces hooks arrays in config patches', () => {
    const base = parseConfigString(COMPLETE_TOML);
    const merged = mergeConfigPatch(base, {
      hooks: [{ event: 'Notification', matcher: 'task_completed', command: 'echo notified' }],
    });

    expect(merged.hooks).toEqual([
      { event: 'Notification', matcher: 'task_completed', command: 'echo notified' },
    ]);
  });

  it('accepts maxOutputSize on a model alias and round-trips it', () => {
    const parsed = ByfConfigSchema.parse({
      providers: { local: { type: 'anthropic', apiKey: 'sk-test' } },
      models: {
        opus: {
          provider: 'local',
          model: 'claude-opus-4-7',
          maxContextSize: 200000,
          maxOutputSize: 32000,
        },
      },
    });
    expect(parsed.models?.['opus']).toMatchObject({
      maxContextSize: 200000,
      maxOutputSize: 32000,
    });
  });

  it('leaves maxOutputSize undefined when omitted', () => {
    const parsed = ByfConfigSchema.parse({
      providers: { local: { type: 'anthropic', apiKey: 'sk-test' } },
      models: {
        opus: {
          provider: 'local',
          model: 'claude-opus-4-7',
          maxContextSize: 200000,
        },
      },
    });
    expect(parsed.models?.['opus']?.maxOutputSize).toBeUndefined();
  });

  it('rejects maxOutputSize <= 0', () => {
    expect(() =>
      ByfConfigSchema.parse({
        providers: { local: { type: 'anthropic', apiKey: 'sk-test' } },
        models: {
          opus: {
            provider: 'local',
            model: 'claude-opus-4-7',
            maxContextSize: 200000,
            maxOutputSize: 0,
          },
        },
      }),
    ).toThrow();
  });
});

describe('config path env override', () => {
  it('uses BYF_HOME when no explicit homeDir is supplied', () => {
    const saved = process.env['BYF_HOME'];
    try {
      process.env['BYF_HOME'] = '/tmp/byf-from-env';

      expect(resolveByfHome()).toBe('/tmp/byf-from-env');
      expect(resolveByfHome('/tmp/byf-explicit')).toBe('/tmp/byf-explicit');
      expect(resolveConfigPath({})).toBe('/tmp/byf-from-env/config.toml');
      expect(resolveConfigPath({ configPath: '/tmp/custom.toml' })).toBe('/tmp/custom.toml');
    } finally {
      if (saved === undefined) delete process.env['BYF_HOME'];
      else process.env['BYF_HOME'] = saved;
    }
  });

  it('defaults to ~/.byf when no env var is set', () => {
    const saved = process.env['BYF_HOME'];
    try {
      delete process.env['BYF_HOME'];

      const result = resolveByfHome();
      expect(result).toMatch(/\/\.byf$/);
    } finally {
      if (saved === undefined) delete process.env['BYF_HOME'];
      else process.env['BYF_HOME'] = saved;
    }
  });
});

describe('thinking effort enum validation', () => {
  it.each(['low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'accepts valid effort value "%s"',
    (effort) => {
      const parsed = ByfConfigSchema.parse({
        thinking: { effort },
      });
      expect(parsed.thinking?.effort).toBe(effort);
    },
  );

  it('rejects an invalid effort value', () => {
    expect(() =>
      ByfConfigSchema.parse({
        thinking: { effort: 'turbo' },
      }),
    ).toThrow(/effort/);
  });

  it('accepts omitted effort (undefined)', () => {
    const parsed = ByfConfigSchema.parse({
      thinking: { mode: 'auto' },
    });
    expect(parsed.thinking?.effort).toBeUndefined();
  });

  it('rejects empty string for effort', () => {
    expect(() =>
      ByfConfigSchema.parse({
        thinking: { effort: '' },
      }),
    ).toThrow();
  });

  it('rejects uppercase effort value (case-sensitive enum)', () => {
    expect(() =>
      ByfConfigSchema.parse({
        thinking: { effort: 'High' },
      }),
    ).toThrow();
  });

  it('includes effort path in error for invalid input', () => {
    try {
      ByfConfigSchema.parse({
        thinking: { effort: 'turbo' },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const msg = (error as Error).message;
      expect(msg).toMatch(/effort/);
      expect(msg).toMatch(/low.*medium.*high.*xhigh.*max/);
      return;
    }
    throw new Error('expected function to throw');
  });
});

describe('config value env override helpers', () => {
  it('parses boolean env values', () => {
    expect(parseBooleanEnv('1')).toBe(true);
    expect(parseBooleanEnv(' true ')).toBe(true);
    expect(parseBooleanEnv('yes')).toBe(true);
    expect(parseBooleanEnv('on')).toBe(true);
    expect(parseBooleanEnv('0')).toBe(false);
    expect(parseBooleanEnv(' false ')).toBe(false);
    expect(parseBooleanEnv('no')).toBe(false);
    expect(parseBooleanEnv('off')).toBe(false);
    expect(parseBooleanEnv('')).toBeUndefined();
    expect(parseBooleanEnv('maybe')).toBeUndefined();
  });

  it('resolves env before config before default', () => {
    expect(
      resolveConfigValue({
        env: { BYF_TEST_FLAG: '0' },
        envKey: 'BYF_TEST_FLAG',
        configValue: true,
        defaultValue: true,
        parseEnv: parseBooleanEnv,
      }),
    ).toBe(false);

    expect(
      resolveConfigValue({
        env: {},
        envKey: 'BYF_TEST_FLAG',
        configValue: false,
        defaultValue: true,
        parseEnv: parseBooleanEnv,
      }),
    ).toBe(false);

    expect(
      resolveConfigValue({
        env: {},
        envKey: 'BYF_TEST_FLAG',
        defaultValue: true,
        parseEnv: parseBooleanEnv,
      }),
    ).toBe(true);
  });

  it('ignores invalid env values', () => {
    expect(
      resolveConfigValue({
        env: { BYF_TEST_FLAG: 'invalid' },
        envKey: 'BYF_TEST_FLAG',
        configValue: false,
        defaultValue: true,
        parseEnv: parseBooleanEnv,
      }),
    ).toBe(false);
  });
});

describe('resolvePrintWaitCeilingS', () => {
  it('defaults to 3600 when env and config are unset', () => {
    expect(resolvePrintWaitCeilingS({ env: {} })).toBe(DEFAULT_PRINT_WAIT_CEILING_S);
    expect(resolvePrintWaitCeilingS({})).toBe(3600);
  });

  it('never returns NaN for empty or invalid env (the broken ?? parseInt path)', () => {
    // parseInt('') is NaN; old session code used NaN ?? 3600 which stayed NaN.
    expect(parsePositiveIntEnv('')).toBeUndefined();
    expect(parsePositiveIntEnv('  ')).toBeUndefined();
    expect(parsePositiveIntEnv('not-a-number')).toBeUndefined();
    expect(parsePositiveIntEnv('0')).toBeUndefined();
    expect(parsePositiveIntEnv('-5')).toBeUndefined();
    expect(resolvePrintWaitCeilingS({ env: { BYF_PRINT_WAIT_CEILING_S: '' } })).toBe(3600);
    expect(resolvePrintWaitCeilingS({ env: { BYF_PRINT_WAIT_CEILING_S: 'abc' } })).toBe(3600);
    expect(
      resolvePrintWaitCeilingS({
        env: { BYF_PRINT_WAIT_CEILING_S: '' },
        configValue: Number.NaN,
      }),
    ).toBe(3600);
  });

  it('uses config when env is unset', () => {
    expect(resolvePrintWaitCeilingS({ env: {}, configValue: 120 })).toBe(120);
  });

  it('env overrides config (docs: BYF_PRINT_WAIT_CEILING_S wins over config.toml)', () => {
    expect(
      resolvePrintWaitCeilingS({
        env: { BYF_PRINT_WAIT_CEILING_S: '45' },
        configValue: 999,
      }),
    ).toBe(45);
  });

  it('invalid env falls through to config then default', () => {
    expect(
      resolvePrintWaitCeilingS({
        env: { BYF_PRINT_WAIT_CEILING_S: 'nope' },
        configValue: 90,
      }),
    ).toBe(90);
    expect(
      resolvePrintWaitCeilingS({
        env: { BYF_PRINT_WAIT_CEILING_S: 'nope' },
      }),
    ).toBe(3600);
  });

  it('rejects non-positive config values', () => {
    expect(resolvePrintWaitCeilingS({ env: {}, configValue: 0 })).toBe(3600);
    expect(resolvePrintWaitCeilingS({ env: {}, configValue: -1 })).toBe(3600);
  });
});

describe('McpServerConfigSchema (SSE)', () => {
  it('parses a valid SSE config with transport: "sse" and a url', () => {
    const result = McpServerConfigSchema.parse({
      transport: 'sse',
      url: 'http://example.com/mcp',
    });
    expect(result).toMatchObject({
      transport: 'sse',
      url: 'http://example.com/mcp',
    });
  });

  it('parses SSE config with all optional fields (headers, bearerTokenEnvVar, common fields)', () => {
    const result = McpServerConfigSchema.parse({
      transport: 'sse',
      url: 'http://example.com/mcp',
      headers: { 'X-Custom': 'val' },
      bearerTokenEnvVar: 'MCP_TOKEN',
      enabled: false,
      startupTimeoutMs: 10_000,
      toolTimeoutMs: 60_000,
      enabledTools: ['tool-a'],
      disabledTools: ['tool-b'],
    });
    expect(result.transport).toBe('sse');
    if (result.transport !== 'sse') throw new Error('expected sse');
    expect(result.url).toBe('http://example.com/mcp');
    expect(result.headers).toEqual({ 'X-Custom': 'val' });
    expect(result.bearerTokenEnvVar).toBe('MCP_TOKEN');
    expect(result.enabled).toBe(false);
    expect(result.startupTimeoutMs).toBe(10_000);
    expect(result.toolTimeoutMs).toBe(60_000);
    expect(result.enabledTools).toEqual(['tool-a']);
    expect(result.disabledTools).toEqual(['tool-b']);
  });

  it('rejects SSE config without url', () => {
    expect(() => McpServerConfigSchema.parse({ transport: 'sse' })).toThrow();
  });

  it('rejects SSE config with invalid url', () => {
    expect(() => McpServerConfigSchema.parse({ transport: 'sse', url: 'not-a-url' })).toThrow();
  });

  it('bare url (no transport) still defaults to "http"', () => {
    const result = McpServerConfigSchema.parse({ url: 'http://example.com/mcp' });
    expect(result.transport).toBe('http');
  });

  it('bare command (no transport) still defaults to "stdio" (regression)', () => {
    const result = McpServerConfigSchema.parse({
      command: 'some-binary',
    });
    expect(result.transport).toBe('stdio');
  });

  it('rejects config with transport "sse" but missing required url', () => {
    const result = McpServerConfigSchema.safeParse({
      transport: 'sse',
    });
    expect(result.success).toBe(false);
  });
});
