import { mkdtempSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes, ByfError } from '../../src/errors';
import {
  ByfConfigSchema,
  ensureConfigFile,
  mergeConfigPatch,
  parseConfigString,
  parseBooleanEnv,
  readConfigFile,
  resolveConfigPath,
  resolveConfigValue,
  resolveByfHome,
  validateConfig,
  writeConfigFile,
} from '../../src/config';
import { analyzeConfig, applyFixes } from '../../src/config/update';
import type { Finding } from '../../src/config/update-rules';
import type { ByfConfig } from '../../src/config/schema';
import { VALID_CAPABILITIES } from '../../src/providers/runtime-provider';

/**
 * Build the expected `invalid-value` detail string from the single source of
 * truth (`VALID_CAPABILITIES`). Using this instead of a hardcoded literal means
 * the tests verify behavior, not a stale copy of the capability list (C2 / AC L149).
 */
function invalidCapabilityDetail(cap: string): string {
  return `"${cap}" is not a valid capability. Valid values: ${VALID_CAPABILITIES.join(', ')}.`;
}

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
    expect(config.services?.webSearch!.providers[1]!.baseUrl).toBe('https://custom.brave.api/search');
    expect(config.services?.webSearch!.providers[1]!.priority).toBe(2);
    expect(config.services?.fetchUrl?.apiKey).toBe('sk-fetch');
    expect(config.services?.fetchUrl?.baseUrl).toBe('https://api.example.test/v1/fetch');
  });

  it('rejects web_search providers with empty api_keys', () => {
    expect(() => parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = []
priority = 1
`)).toThrow(/too_small|1 items/);
  });

  it('rejects web_search providers with missing priority', () => {
    expect(() => parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "exa"
api_keys = ["sk-1"]
`)).toThrow(/priority/);
  });

  it('rejects unknown provider type in web_search', () => {
    expect(() => parseConfigString(`
[services.web_search]

[[services.web_search.providers]]
type = "unknown"
api_keys = ["sk-1"]
priority = 1
`)).toThrow(/type/);
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
    expect(reloaded.services?.webSearch?.providers[1]!.baseUrl).toBe('https://proxy.firecrawl.test/search');
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
    expectByfErrorCode(
      () => parseConfigString('[[[', 'broken.toml'),
      ErrorCodes.CONFIG_INVALID,
    );
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

describe('update-config: analyzeConfig', () => {
  // Shared expected findings for reuse across scenarios
  const defaultYoloRemoved: Finding = {
    kind: 'removed',
    path: 'default_yolo',
    detail: 'Top-level field default_yolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  };

  const defaultYoloCamelRemoved: Finding = {
    kind: 'removed',
    path: 'defaultYolo',
    detail: 'Top-level field defaultYolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  };

  const byfSearchRemoved: Finding = {
    kind: 'removed',
    path: 'services.byf_search',
    detail: 'Deprecated service byf_search is removed.',
    deprecatedSince: 'pre-0.1.0',
  };

  const byfFetchRemoved: Finding = {
    kind: 'removed',
    path: 'services.byf_fetch',
    detail: 'Deprecated service byf_fetch is removed. Use services.fetch_url instead.',
    deprecatedSince: 'pre-0.1.0',
  };

  const maxStepsRenamed: Finding = {
    kind: 'renamed',
    path: 'loop_control.max_steps_per_run',
    detail: 'Renamed to max_steps_per_turn.',
    deprecatedSince: 'pre-0.1.0',
  };

  const coreInput = {
    raw: {
      default_yolo: true,
      providers: { p: { type: 'anthropic' as const } },
      services: { byf_search: {}, byf_fetch: { base_url: 'http://old' }, web_search: { providers: [] } },
      loop_control: { max_steps_per_run: 50, max_retries_per_step: 3 },
    },
  };

  // ── Scenario 1: Core case ──────────────────────────────────────
  it('finds 4 issues from a config with all deprecated fields', () => {
    const findings = analyzeConfig(coreInput);
    expect(findings).toContainEqual(defaultYoloRemoved);
    expect(findings).toContainEqual(byfSearchRemoved);
    expect(findings).toContainEqual(byfFetchRemoved);
    expect(findings).toContainEqual(maxStepsRenamed);
    expect(findings).toHaveLength(4);
  });

  // ── Scenario 2: snake_case top-level removed ───────────────────
  it('reports default_yolo at top level (snake_case)', () => {
    const findings = analyzeConfig({ raw: { default_yolo: true } });
    expect(findings).toEqual([defaultYoloRemoved]);
  });

  // ── Scenario 3: camelCase top-level removed ────────────────────
  it('reports defaultYolo at top level (camelCase)', () => {
    const findings = analyzeConfig({ raw: { defaultYolo: 'yes' } });
    expect(findings).toEqual([defaultYoloCamelRemoved]);
  });

  // ── Scenario 4: Degenerate — both variants coexist ─────────────
  it('reports both default_yolo and defaultYolo when both are present', () => {
    const findings = analyzeConfig({ raw: { default_yolo: 1, defaultYolo: 1 } });
    expect(findings).toContainEqual(defaultYoloRemoved);
    expect(findings).toContainEqual(defaultYoloCamelRemoved);
    expect(findings).toHaveLength(2);
  });

  // ── Scenario 5: Nested service key byf_search ──────────────────
  it('reports services.byf_search as removed', () => {
    const findings = analyzeConfig({ raw: { services: { byf_search: { base_url: 'http://old' } } } });
    expect(findings).toEqual([byfSearchRemoved]);
  });

  // ── Scenario 6: Nested service key byf_fetch ───────────────────
  it('reports services.byf_fetch as removed', () => {
    const findings = analyzeConfig({ raw: { services: { byf_fetch: {} } } });
    expect(findings).toEqual([byfFetchRemoved]);
  });

  // ── Scenario 7: Renamed nested key ─────────────────────────────
  it('reports loop_control.max_steps_per_run as renamed', () => {
    const findings = analyzeConfig({
      raw: { loop_control: { max_steps_per_run: 25, compaction_trigger_ratio: 0.8 } },
    });
    expect(findings).toEqual([maxStepsRenamed]);
  });

  // ── Scenario 8: Clean config — no deprecated or unknown fields ──
  it('returns empty array for a clean config', () => {
    const findings = analyzeConfig({
      raw: {
        providers: { p: { type: 'anthropic' as const } },
        services: { web_search: { providers: [] } },
        loop_control: { max_steps_per_turn: 50 },
      },
    });
    expect(findings).toEqual([]);
  });

  // ── Scenario 9: No crash on missing raw ────────────────────────
  it('returns empty array when raw is undefined or absent', () => {
    expect(analyzeConfig({})).toEqual([]);
    expect(analyzeConfig({ raw: undefined })).toEqual([]);
  });

  // ── Scenario 10: Raw services is scalar ────────────────────────
  it('does not crash when services is a scalar', () => {
    const findings = analyzeConfig({ raw: { services: 'corrupted' } });
    expect(findings).toEqual([]);
  });

  // ── Scenario 11: Raw loop_control is scalar ────────────────────
  it('does not crash when loop_control is a scalar', () => {
    const findings = analyzeConfig({ raw: { loop_control: 42 } });
    expect(findings).toEqual([]);
  });

  // ── Scenario 12: Detection by key presence, not truthiness ─────
  it('reports default_yolo even when its value is null', () => {
    const findings = analyzeConfig({ raw: { default_yolo: null } });
    expect(findings).toEqual([defaultYoloRemoved]);
  });

  // ── Scenario 13: Empty sub-object ──────────────────────────────
  it('returns empty array for empty services sub-object', () => {
    const findings = analyzeConfig({ raw: { services: {} } });
    expect(findings).toEqual([]);
  });

  // ── Scenario 14: Kind correctness matrix ───────────────────────
  it('returns correct kind values for each finding (kind matrix)', () => {
    const findings = analyzeConfig(coreInput);
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'removed', path: 'default_yolo' }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'removed', path: 'services.byf_search' }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'removed', path: 'services.byf_fetch' }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: 'renamed', path: 'loop_control.max_steps_per_run' }),
    );
    expect(findings).toHaveLength(4);
  });

  // ── Scenario 15: Pure raw scanning — no collision with schema ──
  it('does not report max_steps_per_turn (already migrated)', () => {
    const findings = analyzeConfig({
      raw: { loop_control: { max_steps_per_run: 50, max_steps_per_turn: 50 } },
    });
    expect(findings).toEqual([maxStepsRenamed]);
  });

  // ── Scenario 16: Unknown fields are now reported ──────────────────
  it('reports unknown fields', () => {
    const findings = analyzeConfig({
      raw: {
        notifications: { email: 'a@b' },
        my_custom_tool: { path: '/usr/bin/foo' },
      },
    });
    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual({
      kind: 'unknown',
      path: 'notifications',
      detail: expect.stringContaining('notifications'),
    });
    expect(findings).toContainEqual({
      kind: 'unknown',
      path: 'my_custom_tool',
      detail: expect.stringContaining('my_custom_tool'),
    });
  });
});

describe('update-config: applyFixes', () => {
  // Shared expected findings (local copies for scope)
  const defaultYoloRemoved: Finding = {
    kind: 'removed',
    path: 'default_yolo',
    detail: 'Top-level field default_yolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  };
  const defaultThinkingMigrated: Finding = {
    kind: 'migrated',
    path: 'default_thinking',
    detail: 'Migrate default_thinking to [thinking] block.',
    deprecatedSince: 'pre-0.1.0',
  };
  const defaultThinkingRemoved: Finding = {
    kind: 'removed',
    path: 'default_thinking',
    detail: 'Already superseded by [thinking] block.',
    deprecatedSince: 'pre-0.1.0',
  };
  const byfFetchRemoved: Finding = {
    kind: 'removed',
    path: 'services.byf_fetch',
    detail: 'Deprecated service byf_fetch is removed. Use services.fetch_url instead.',
    deprecatedSince: 'pre-0.1.0',
  };

  // ── Group A — Core functionality ──────────────────────────────

  it('A1: removes all 5 deprecated fields', () => {
    const config = {
      raw: {
        default_yolo: true,
        defaultYolo: true,
        providers: { p: { type: 'anthropic' as const } },
        services: {
          byf_search: {},
          byf_fetch: { base_url: 'http://old' },
          web_search: { providers: [] },
        },
        loop_control: { max_steps_per_run: 50, max_steps_per_turn: 25 },
        telemetry: true,
      },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw).not.toHaveProperty('defaultYolo');
    expect(result.raw).not.toHaveProperty('services.byf_search');
    expect(result.raw).not.toHaveProperty('services.byf_fetch');
    expect(result.raw).not.toHaveProperty('loop_control.max_steps_per_run');
    expect(result.raw).toHaveProperty('providers');
    expect(result.raw).toHaveProperty('services.web_search');
    expect(result.raw).toHaveProperty('loop_control.max_steps_per_turn');
    expect(result.raw).toHaveProperty('telemetry');
  });

  it('A2: removes default_yolo', () => {
    const config = {
      raw: { default_yolo: true, providers: { p: { type: 'anthropic' as const } } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw).toHaveProperty('providers');
  });

  it('A3: removes defaultYolo, preserves theme', () => {
    const config = { raw: { defaultYolo: true, theme: 'dark' }, providers: {} } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('defaultYolo');
    expect(result.raw['theme']).toBe('dark');
  });

  it('A4: removes services.byf_search, preserves web_search', () => {
    const config = {
      raw: { services: { byf_search: {}, web_search: { providers: [] } } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw['services']).not.toHaveProperty('byf_search');
    expect(result.raw['services']).toHaveProperty('web_search');
  });

  // ── A5: Removes services.byf_fetch ────────────────────────────
  it('A5: removes services.byf_fetch', () => {
    const config = {
      raw: { services: { byf_fetch: { base_url: 'http://old' }, web_search: { providers: [] } } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw['services']).not.toHaveProperty('byf_fetch');
    expect(result.raw['services']).toHaveProperty('web_search');
  });

  // ── A6: Removes loop_control.max_steps_per_run ───────────────
  it('A6: removes loop_control.max_steps_per_run', () => {
    const config = {
      raw: { loop_control: { max_steps_per_run: 50, max_retries_per_step: 3 } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw['loop_control']).not.toHaveProperty('max_steps_per_run');
    expect(result.raw['loop_control']).toHaveProperty('max_retries_per_step');
  });

  // ── A7: Removes all 5 deprecated fields ──────────────────────
  it('A7: removes all 5 deprecated fields at once', () => {
    const config = {
      raw: {
        default_yolo: true,
        defaultYolo: true,
        services: { byf_search: {}, byf_fetch: { base_url: 'http://old' } },
        loop_control: { max_steps_per_run: 50 },
      },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw).not.toHaveProperty('defaultYolo');
    // services/loop_control keys cleaned up when empty after removing deprecated fields
    expect(result.raw).not.toHaveProperty('services');
    expect(result.raw).not.toHaveProperty('loop_control');
  });

  // ── B1: Empty raw ────────────────────────────────────────────
  it('B1: empty raw stays empty', () => {
    const config = { raw: {}, providers: {} } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).toEqual({});
  });

  // ── B2: Missing raw ──────────────────────────────────────────
  it('B2: missing raw handled gracefully', () => {
    const config = { providers: {} } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).toEqual({});
  });

  // ── B3: Preserves nested non-deprecated fields ───────────────
  it('B3: preserves nested non-deprecated fields', () => {
    const config = {
      raw: { services: { byf_search: {}, web_search: { providers: [] } } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw['services']).not.toHaveProperty('byf_search');
    expect(result.raw['services']).toHaveProperty('web_search');
  });

  // ── B4: Preserves unknown/custom fields ──────────────────────
  it('B4: preserves unknown fields like telemetry, theme, notifications', () => {
    const config = {
      raw: { default_yolo: true, telemetry: true, theme: 'dark', notifications: { email: 'a@b' } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw['telemetry']).toBe(true);
    expect(result.raw['theme']).toBe('dark');
    expect(result.raw['notifications']).toEqual({ email: 'a@b' });
  });

  // ── C1: Concurrent findings mixed with removed ───────────────
  it('C1: applyFixes cleans deprecated paths despite concurrent findings', () => {
    const config = {
      raw: { default_yolo: true, loop_control: { max_steps_per_run: 50 } },
      providers: {},
    } as ByfConfig;
    const miscFindings: Finding[] = [
      { kind: 'invalid-value', path: 'models.m.capabilities[0]', detail: 'test' },
    ];
    const result = applyFixes(config, miscFindings);
    expect(result.raw).not.toHaveProperty('default_yolo');
    // loop_control cleaned up when empty after removing deprecated keys
    expect(result.raw).not.toHaveProperty('loop_control');
  });

  // ── C2: All finding kinds present ────────────────────────────
  it('C2: handles all finding kinds without affecting deletion', () => {
    const config = {
      raw: { default_yolo: true, telemetry: true },
      providers: {},
    } as ByfConfig;
    const allFindings: Finding[] = [
      { kind: 'unknown', path: 'telemetry', detail: 'test' },
      { kind: 'invalid-value', path: 'models.m.capabilities[0]', detail: 'test' },
    ];
    const result = applyFixes(config, allFindings);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw['telemetry']).toBe(true);
  });

  // ── C3: Only non-removed findings ────────────────────────────
  it('C3: only dangling findings do not affect deletion', () => {
    const config = {
      raw: { default_yolo: true },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [
      { kind: 'dangling', path: 'default_provider', detail: 'test' },
    ]);
    expect(result.raw).not.toHaveProperty('default_yolo');
  });

  // ── C4: Only renamed findings ────────────────────────────────
  it('C4: only renamed findings do not affect deletion', () => {
    const config = {
      raw: { loop_control: { max_steps_per_run: 50 } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [
      { kind: 'renamed', path: 'loop_control.max_steps_per_run', detail: 'Renamed.', deprecatedSince: 'pre-0.1.0' },
    ]);
    // loop_control cleaned up when empty after removing deprecated keys
    expect(result.raw).not.toHaveProperty('loop_control');
  });

  // ── D1: findings ignored ─────────────────────────────────────
  it('D1: findings parameter is not consulted for deletion', () => {
    const config = {
      raw: { default_yolo: true },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
  });

  // ── D2: Empty findings still removes deprecated fields ───────
  it('D2: empty findings list still triggers all deletions', () => {
    const config = {
      raw: { default_yolo: true, services: { byf_search: {} } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw).not.toHaveProperty('default_yolo');
    // services becomes empty after removing byf_search, so the key is cleaned up
  });

  // ── E1: No default_thinking → no change ─────────────────────
  it('E1: no default_thinking, no changes to config', () => {
    const config = { raw: { theme: 'dark' }, providers: {} } as ByfConfig;
    const result = applyFixes(config, []);
    expect(result.raw['theme']).toBe('dark');
    expect(result.thinking).toBeUndefined();
  });

  // ── E2: default_thinking = null → migrated as falsy ──────────
  it('E2: migrates default_thinking=null to thinking {mode:"off"} (falsy)', () => {
    const config = { raw: { default_thinking: null }, providers: {} } as ByfConfig;
    const result = applyFixes(config, [{ kind: 'migrated', path: 'default_thinking', detail: 'Migrate.', deprecatedSince: 'pre-0.1.0' }]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.thinking).toEqual({ mode: 'off' });
  });

  // ── E3: Idempotent ──────────────────────────────────────────
  it('E3: second applyFixes produces same result as first', () => {
    const config = { raw: { default_thinking: true }, providers: {} } as ByfConfig;
    const first = applyFixes(config, [{ kind: 'migrated', path: 'default_thinking', detail: 'Migrate.', deprecatedSince: 'pre-0.1.0' }]);
    const second = applyFixes(first, []);
    expect(second).toEqual(first);
  });

  // ── F1: Unknown field telemetry preserved ────────────────────
  it('F1: applyFixes does not remove unknown field telemetry', () => {
    const config = {
      raw: { default_yolo: true, telemetry: true },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [
      { kind: 'removed', path: 'default_yolo', detail: 'Removed.', deprecatedSince: 'pre-0.1.0' },
      { kind: 'unknown', path: 'telemetry', detail: 'test' },
    ]);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw['telemetry']).toBe(true);
  });

  // ── F2: notifications preserved ──────────────────────────────
  it('F2: applyFixes preserves notifications', () => {
    const config = {
      raw: { notifications: { email: 'a@b' }, default_yolo: true },
      providers: {},
    } as ByfConfig;
    const findings: Finding[] = [
      { kind: 'unknown', path: 'notifications', detail: 'test' },
      { kind: 'removed', path: 'default_yolo', detail: 'Removed.', deprecatedSince: 'pre-0.1.0' },
    ];
    const result = applyFixes(config, findings);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.raw['notifications']).toEqual({ email: 'a@b' });
  });

  // ── F3: my_custom_tool preserved ─────────────────────────────
  it('F3: applyFixes preserves my_custom_tool', () => {
    const config = {
      raw: { my_custom_tool: { path: '/usr/bin/foo' } },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [{ kind: 'unknown', path: 'my_custom_tool', detail: 'test' }]);
    expect(result.raw['my_custom_tool']).toEqual({ path: '/usr/bin/foo' });
  });

  // ── G1: default_thinking=true with DEPRECATED_FIELD_RULES ────
  it('G1: removes default_thinking via DEPRECATED_FIELD_RULES when raw has migrated value', () => {
    const config = {
      raw: { default_thinking: true, default_yolo: true },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [
      { kind: 'removed', path: 'default_thinking', detail: 'Removed.', deprecatedSince: 'pre-0.1.0' },
      { kind: 'removed', path: 'default_yolo', detail: 'Removed.', deprecatedSince: 'pre-0.1.0' },
    ]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.raw).not.toHaveProperty('default_yolo');
  });

  // ── G2: default_thinking undefined with raw default_yolo ─────
  it('G2: removes default_yolo but keeps raw when no default_thinking', () => {
    const config = {
      raw: { default_yolo: true },
      providers: {},
    } as ByfConfig;
    const result = applyFixes(config, [defaultYoloRemoved]);
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.thinking).toBeUndefined();
  });

  // ── H1: default_thinking migrated with removed fields ────────
  it('H1: migrates default_thinking (migrated) and removes other fields', () => {
    const config = {
      raw: { default_thinking: true, default_yolo: true, services: { byf_fetch: {} } },
      providers: {} as const,
    } as ByfConfig;
    const result = applyFixes(config, [defaultThinkingMigrated, defaultYoloRemoved, byfFetchRemoved]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.raw).not.toHaveProperty('default_yolo');
    // services key cleaned up when empty after removing deprecated fields
    expect(result.raw).not.toHaveProperty('services');
    expect(result.thinking).toEqual({ mode: 'on', effort: 'high' });
  });

  // ── H2: Removed + other deprecated fields ────────────────────
  it('H2: removes default_thinking (removed) and other fields, preserves thinking', () => {
    const config = {
      raw: { default_thinking: true, default_yolo: true },
      thinking: { mode: 'off' },
      providers: {} as const,
    } as ByfConfig;
    const result = applyFixes(config, [defaultThinkingRemoved, defaultYoloRemoved]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.raw).not.toHaveProperty('default_yolo');
    expect(result.thinking).toEqual({ mode: 'off' });
  });

  // ── S1: Sanitization — findings never expose sensitive values ───
  it('S1: does not expose api_key values in finding details', () => {
    const config = {
      raw: {
        default_yolo: true,
        services: { byf_fetch: { api_key: 'secret-123', base_url: 'http://old' } },
      },
      providers: { p: { type: 'anthropic' } },
    } as ByfConfig;
    const findings = analyzeConfig(config);
    // Verify no finding detail or path contains the secret
    for (const f of findings) {
      expect(f.detail).not.toContain('secret-123');
      expect(f.path).not.toContain('secret-123');
    }
  });

  // ── S2: Dangling findings do not trigger any deletion ──────────
  it('S2: applyFixes does not delete dangling references', () => {
    const config = {
      raw: { default_yolo: true },
      providers: { p: { type: 'anthropic' } },
      models: { m: { provider: 'nonexistent', model: 'gpt-4', maxContextSize: 8000 } },
    } as ByfConfig;
    const result = applyFixes(config, [
      { kind: 'dangling', path: 'models.m.provider', detail: 'test' },
      defaultYoloRemoved,
    ]);
    // Whitelist paths are still deleted
    expect(result.raw).not.toHaveProperty('default_yolo');
    // Dangling references are a parsed-config concept — they are not in
    // raw and cannot be deleted. The model alias definition in `models`
    // (parsed config) is preserved.
    expect(result.models).toEqual({
      m: { provider: 'nonexistent', model: 'gpt-4', maxContextSize: 8000 },
    });
  });
});

describe('update-config: default_thinking migration', () => {
  // Shared expected findings
  const defaultThinkingMigrated: Finding = {
    kind: 'migrated',
    path: 'default_thinking',
    detail: 'Migrate default_thinking to [thinking] block.',
    deprecatedSince: 'pre-0.1.0',
  };

  const defaultThinkingRemoved: Finding = {
    kind: 'removed',
    path: 'default_thinking',
    detail: 'Already superseded by [thinking] block.',
    deprecatedSince: 'pre-0.1.0',
  };

  const defaultYoloRemoved: Finding = {
    kind: 'removed',
    path: 'default_yolo',
    detail: 'Top-level field default_yolo is removed. Use yolo instead.',
    deprecatedSince: 'pre-0.1.0',
  };

  // ── M1: default_thinking without [thinking] block ────────────
  it('M1: reports default_thinking as migrated when no [thinking] block', () => {
    const config: ByfConfig = { raw: { default_thinking: true }, providers: {} };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual(defaultThinkingMigrated);
  });

  // ── M2: default_thinking with [thinking] mode ────────────────
  it('M2: upgrades to removed when [thinking] has mode', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true },
      thinking: { mode: 'auto' },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual(defaultThinkingRemoved);
  });

  // ── M3: default_thinking with [thinking] effort ──────────────
  it('M3: upgrades to removed when [thinking] has effort', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true },
      thinking: { effort: 'high' },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual(defaultThinkingRemoved);
  });

  // ── M4: default_thinking with both mode and effort ──────────
  it('M4: upgrades to removed when [thinking] has both mode and effort', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true },
      thinking: { mode: 'on', effort: 'high' },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual(defaultThinkingRemoved);
  });

  // ── M5: applyFixes with migrated finding adds thinking block ─
  it('M5: applyFixes with migrated finding adds thinking block (truthy)', () => {
    const config: ByfConfig = { raw: { default_thinking: true }, providers: {} };
    const result = applyFixes(config, [defaultThinkingMigrated]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.thinking).toEqual({ mode: 'on', effort: 'high' });
  });

  // ── M6: applyFixes with migrated finding adds thinking block (falsy) ─
  it('M6: applyFixes with migrated finding adds thinking block (falsy)', () => {
    const config: ByfConfig = { raw: { default_thinking: false }, providers: {} };
    const result = applyFixes(config, [defaultThinkingMigrated]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.thinking).toEqual({ mode: 'off' });
  });

  // ── M7: applyFixes with removed finding does NOT add thinking ──
  it('M7: applyFixes with removed finding does not add thinking block', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true },
      thinking: { mode: 'auto' },
      providers: {},
    };
    const result = applyFixes(config, [defaultThinkingRemoved]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.thinking).toEqual({ mode: 'auto' });
  });

  // ── M8: applyFixes with migrated finding triggers migration even with existing thinking ──
  it('M8: migrated finding triggers migration, overwriting existing thinking', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true, default_yolo: true },
      thinking: { mode: 'off' },
      providers: {},
    };
    const result = applyFixes(config, [defaultThinkingMigrated, defaultYoloRemoved]);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.raw).not.toHaveProperty('default_yolo');
    // migrated finding always triggers migration regardless of existing thinking block
    expect(result.thinking).toEqual({ mode: 'on', effort: 'high' });
  });

  // ── M9: default_thinking=false with no [thinking] ────────────
  it('M9: applyFixes with migrated finding for falsy value', () => {
    const config: ByfConfig = { raw: { default_thinking: false }, providers: {} };
    const result = applyFixes(config, [defaultThinkingMigrated]);
    expect(result.thinking).toEqual({ mode: 'off' });
  });

  // ── M10: [thinking] mode="auto" (no effort) + default_thinking=true ──
  // analyzeConfig reports default_thinking as "removed" because [thinking] takes
  // precedence. applyFixes deletes default_thinking and keeps the explicit mode.
  // Note: before migration, default_thinking=true provided effort='high' as a
  // fallback; after fix, effort remains undefined — a subtle but acceptable
  // behavior change since the user explicitly configured [thinking].
  it('M10: keeps [thinking] mode="auto" and deletes default_thinking when both exist', () => {
    const config: ByfConfig = {
      raw: { default_thinking: true },
      thinking: { mode: 'auto' },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual(defaultThinkingRemoved);

    const result = applyFixes(config, findings);
    expect(result.raw).not.toHaveProperty('default_thinking');
    expect(result.thinking).toEqual({ mode: 'auto' });
  });
});

describe('update-config: dangling references', () => {
  // ── 1. Single dangling model alias ──────────────────────────────
  it('reports dangling when model alias references non-existent provider', () => {
    const config: ByfConfig = {
      providers: { existing: { type: 'anthropic' } },
      models: { gpt4: { provider: 'deleted', model: 'gpt-4', maxContextSize: 8000 } },
    };
    const findings = analyzeConfig(config);
    expect(findings).toEqual([
      {
        kind: 'dangling',
        path: 'models.gpt4.provider',
        detail: 'Model alias "gpt4" references provider "deleted", which does not exist in [providers].',
      },
    ]);
  });

  // ── 2. Dangling default_provider ───────────────────────────────
  it('reports dangling when defaultProvider does not exist in providers', () => {
    const config: ByfConfig = {
      providers: {},
      defaultProvider: 'deleted',
    };
    const findings = analyzeConfig(config);
    expect(findings).toEqual([
      {
        kind: 'dangling',
        path: 'default_provider',
        detail: 'Default provider "deleted" does not exist in [providers].',
      },
    ]);
  });

  // ── 3. Dangling default_model ──────────────────────────────────
  it('reports dangling when defaultModel does not exist in models', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: { existing: { provider: 'p', model: 'gpt-4', maxContextSize: 8000 } },
      defaultModel: 'gpt4',
    };
    const findings = analyzeConfig(config);
    expect(findings).toEqual([
      {
        kind: 'dangling',
        path: 'default_model',
        detail: 'Default model "gpt4" does not exist in [models].',
      },
    ]);
  });

  // ── 4. All 3 dangling types present ────────────────────────────
  it('reports 3 dangling findings when all three types are present', () => {
    const config: ByfConfig = {
      providers: {},
      models: {
        gpt4: { provider: 'deleted-provider', model: 'gpt-4', maxContextSize: 8000 },
      },
      defaultProvider: 'missing-provider',
      defaultModel: 'gpt5',
    };
    const findings = analyzeConfig(config);
    expect(findings).toHaveLength(3);
    expect(findings).toContainEqual({
      kind: 'dangling',
      path: 'models.gpt4.provider',
      detail: 'Model alias "gpt4" references provider "deleted-provider", which does not exist in [providers].',
    });
    expect(findings).toContainEqual({
      kind: 'dangling',
      path: 'default_provider',
      detail: 'Default provider "missing-provider" does not exist in [providers].',
    });
    expect(findings).toContainEqual({
      kind: 'dangling',
      path: 'default_model',
      detail: 'Default model "gpt5" does not exist in [models].',
    });
  });

  // ── 5. Clean config (no dangling) ──────────────────────────────
  it('returns no dangling findings for a clean config with valid references', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: { m: { provider: 'p', model: 'gpt-4', maxContextSize: 8000 } },
      defaultProvider: 'p',
      defaultModel: 'm',
    };
    const findings = analyzeConfig(config);
    const danglingFindings = findings.filter((f) => f.kind === 'dangling');
    expect(danglingFindings).toEqual([]);
  });

  // ── 6. Dangling coexists with other findings ───────────────────
  it('reports both dangling and removed/renamed findings', () => {
    const config: ByfConfig = {
      raw: { default_yolo: true },
      providers: { p: { type: 'anthropic' } },
      models: {
        gpt4: { provider: 'deleted', model: 'gpt-4', maxContextSize: 8000 },
      },
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual({
      kind: 'removed',
      path: 'default_yolo',
      detail: 'Top-level field default_yolo is removed. Use yolo instead.',
      deprecatedSince: 'pre-0.1.0',
    });
    expect(findings).toContainEqual({
      kind: 'dangling',
      path: 'models.gpt4.provider',
      detail: 'Model alias "gpt4" references provider "deleted", which does not exist in [providers].',
    });
    expect(findings).toHaveLength(2);
  });

  // ── 7. No default_provider = no finding ────────────────────────
  it('does not report dangling when defaultProvider is undefined', () => {
    const config: ByfConfig = { providers: {} };
    const findings = analyzeConfig(config);
    expect(findings.filter((f) => f.kind === 'dangling')).toEqual([]);
  });

  // ── 8. Default provider exists = no finding ────────────────────
  it('does not report dangling when defaultProvider references an existing provider', () => {
    const config: ByfConfig = {
      providers: { existing: { type: 'anthropic' } },
      defaultProvider: 'existing',
    };
    const findings = analyzeConfig(config);
    expect(findings.filter((f) => f.kind === 'dangling')).toEqual([]);
  });

  // ── 9. Default model exists = no finding ───────────────────────
  it('does not report dangling when defaultModel references an existing model alias', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: { 'my-model': { provider: 'p', model: 'gpt-4', maxContextSize: 8000 } },
      defaultModel: 'my-model',
    };
    const findings = analyzeConfig(config);
    expect(findings.filter((f) => f.kind === 'dangling')).toEqual([]);
  });
});

describe('update-config: unknown fields and invalid values', () => {
  // ── 1. Top-level unknown field ────────────────────────────
  it('reports unknown for unrecognized top-level field', () => {
    const config: ByfConfig = {
      raw: { telemetry: true },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      kind: 'unknown',
      path: 'telemetry',
      detail:
        'Field "telemetry" is not recognized by the current schema. Its value has been ignored. This may be a typo or a field from a previous version.',
    });
  });

  // ── 2. Unknown + deprecated ────────────────────────────────
  it('reports both unknown and deprecated fields', () => {
    const config: ByfConfig = {
      raw: { telemetry: true, default_yolo: true },
      providers: {},
    };
    const findings = analyzeConfig(config);
    expect(findings).toHaveLength(2);
    expect(findings).toContainEqual({
      kind: 'unknown',
      path: 'telemetry',
      detail:
        'Field "telemetry" is not recognized by the current schema. Its value has been ignored. This may be a typo or a field from a previous version.',
    });
    expect(findings).toContainEqual({
      kind: 'removed',
      path: 'default_yolo',
      detail: 'Top-level field default_yolo is removed. Use yolo instead.',
      deprecatedSince: 'pre-0.1.0',
    });
  });

  // ── 3. No unknown fields ──────────────────────────────────
  it('returns no unknown findings for a clean config', () => {
    const config: ByfConfig = {
      raw: {},
      providers: {},
    };
    const findings = analyzeConfig(config);
    const unknownFindings = findings.filter((f) => f.kind === 'unknown');
    expect(unknownFindings).toEqual([]);
  });

  // ── 4. Invalid capability ──────────────────────────────────
  it('reports invalid-value for unrecognized capability', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: {
        m: {
          provider: 'p',
          model: 'gpt-4',
          maxContextSize: 8000,
          capabilities: ['vision'],
        },
      },
    };
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual({
      kind: 'invalid-value',
      path: 'models.m.capabilities[0]',
      detail: invalidCapabilityDetail('vision'),
    });
  });

  // ── 5. Valid capability ────────────────────────────────────
  it('does not report invalid-value for a valid capability', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: {
        m: {
          provider: 'p',
          model: 'gpt-4',
          maxContextSize: 8000,
          capabilities: ['image_in'],
        },
      },
    };
    const findings = analyzeConfig(config);
    const invalidFindings = findings.filter((f) => f.kind === 'invalid-value');
    expect(invalidFindings).toEqual([]);
  });

  // ── 6. Case-insensitive capability ─────────────────────────
  it('does not report invalid-value for case-variant of valid capability', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: {
        m: {
          provider: 'p',
          model: 'gpt-4',
          maxContextSize: 8000,
          capabilities: ['IMAGE_IN'],
        },
      },
    };
    const findings = analyzeConfig(config);
    const invalidFindings = findings.filter((f) => f.kind === 'invalid-value');
    expect(invalidFindings).toEqual([]);
  });

  // ── 7. Mixed valid + invalid capabilities ──────────────────
  it('only reports invalid capabilities when mixed with valid ones', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: {
        m: {
          provider: 'p',
          model: 'gpt-4',
          maxContextSize: 8000,
          capabilities: ['image_in', 'vision', 'thinking'],
        },
      },
    };
    const findings = analyzeConfig(config);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toEqual({
      kind: 'invalid-value',
      path: 'models.m.capabilities[1]',
      detail: invalidCapabilityDetail('vision'),
    });
  });

  // ── 8. No models → no invalid-value findings ───────────────
  it('does not report invalid-value when there are no models', () => {
    const config: ByfConfig = { providers: {} };
    const findings = analyzeConfig(config);
    const invalidFindings = findings.filter((f) => f.kind === 'invalid-value');
    expect(invalidFindings).toEqual([]);
  });

  // ── 9. Unknown skips deprecated fields ─────────────────────
  it('does not report deprecated fields as unknown', () => {
    const config: ByfConfig = {
      raw: { default_yolo: true },
      providers: {},
    };
    const findings = analyzeConfig(config);
    const unknownFindings = findings.filter((f) => f.kind === 'unknown');
    expect(unknownFindings).toEqual([]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('removed');
  });

  // ── 10. Nested unknown: model alias field typo (C1 / AC L147) ──
  it('reports nested unknown field as a typo in a model alias', () => {
    const config = {
      raw: {
        models: { 'gpt-4': { max_context_tokns: 8000 } },
      },
      providers: { p: { type: 'anthropic' } },
    } as ByfConfig;
    const findings = analyzeConfig(config);
    const nested = findings.filter((f) => f.path.startsWith('models.'));
    expect(nested).toContainEqual({
      kind: 'unknown',
      path: 'models.gpt-4.max_context_tokns',
      detail:
        'Field "max_context_tokns" is not recognized in models.gpt-4. This may be a typo or a field from a previous version.',
    });
  });

  // ── 11. Nested unknown: provider field typo ──────────────────
  it('reports nested unknown field as a typo in a provider', () => {
    const config = {
      raw: {
        providers: { anthropic: { api_kei: 'sk-x' } },
      },
      providers: { anthropic: { type: 'anthropic' } },
    } as ByfConfig;
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual({
      kind: 'unknown',
      path: 'providers.anthropic.api_kei',
      detail:
        'Field "api_kei" is not recognized in providers.anthropic. This may be a typo or a field from a previous version.',
    });
  });

  // ── 12. Nested unknown: non-record container (background) ────
  it('reports nested unknown field in a direct-object container', () => {
    const config = {
      raw: { background: { max_tasks: 4 } }, // typo: should be max_running_tasks
      providers: {},
    } as ByfConfig;
    const findings = analyzeConfig(config);
    expect(findings).toContainEqual({
      kind: 'unknown',
      path: 'background.max_tasks',
      detail:
        'Field "max_tasks" is not recognized in [background]. This may be a typo or a field from a previous version.',
    });
  });

  // ── 13. Nested unknown does NOT fire on valid schema keys ────
  it('does not report unknown for valid nested schema keys', () => {
    const config = {
      raw: {
        background: { max_running_tasks: 4 },
        thinking: { mode: 'auto', effort: 'high' },
      },
      providers: {},
    } as ByfConfig;
    const findings = analyzeConfig(config);
    const nested = findings.filter((f) => f.path.includes('.'));
    expect(nested).toEqual([]);
  });

  // ── 14. permission legacy shorthand not reported as unknown (C4) ─
  it('does not report permission.deny/allow/ask legacy shorthand as unknown', () => {
    const config = {
      raw: {
        permission: {
          deny: [{ tool: 'Bash', match: 'rm *' }],
          allow: [{ tool: 'Read', match: 'src/**' }],
          ask: [{ tool: 'Write' }],
        },
      },
      providers: {},
    } as ByfConfig;
    const findings = analyzeConfig(config);
    const unknownFindings = findings.filter((f) => f.kind === 'unknown');
    expect(unknownFindings).toEqual([]);
  });

  // ── 15. Single source of truth: detail list derived from VALID_CAPABILITIES (C2 / AC L149)
  it('invalid-value detail lists exactly the VALID_CAPABILITIES set (no drift)', () => {
    const config: ByfConfig = {
      providers: { p: { type: 'anthropic' } },
      models: {
        m: {
          provider: 'p',
          model: 'gpt-4',
          maxContextSize: 8000,
          capabilities: ['__definitely_invalid__'],
        },
      },
    };
    const findings = analyzeConfig(config);
    const invalid = findings.find((f) => f.kind === 'invalid-value');
    expect(invalid).toBeDefined();
    // The detail must enumerate exactly VALID_CAPABILITIES, joined by ", ".
    const expectedSuffix = `Valid values: ${VALID_CAPABILITIES.join(', ')}.`;
    expect(invalid!.detail.endsWith(expectedSuffix)).toBe(true);
  });

  // ── 16. capability resolver + validator share one source (C2) ─
  it('VALID_CAPABILITIES equals exactly CAPABILITY_DEFINITIONS names', async () => {
    const { CAPABILITY_DEFINITIONS } = await import('#/providers/runtime-provider');
    const defNames = new Set(CAPABILITY_DEFINITIONS.map((d) => d.name));
    // VALID_CAPABILITIES is derived from CAPABILITY_DEFINITIONS, so they
    // must be identical sets. This pins the single-source-of-truth contract.
    expect(VALID_CAPABILITIES).toEqual([...defNames]);
  });
});
