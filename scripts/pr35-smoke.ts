/**
 * PRD-0035 端到端冒烟（临时验证脚本，跑完删除）：
 * 真实 ByfHarness + startWebServer，验证 config raw 掩码/409 与会话删除/index 重建。
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startWebServer } from '../apps/web/server/src/server.ts';
import { ByfHarness } from '../packages/node-sdk/src/byf-harness.ts';

const home = await mkdtemp(join(tmpdir(), 'byf-pr35-smoke-'));
process.env['BYF_HOME'] = home;

const configPath = join(home, 'config.toml');
await mkdir(home, { recursive: true });
await writeFile(
  configPath,
  `# smoke config\n[providers.ds]\ntype = "openai-completions"\nbase_url = "https://api.deepseek.com"\napi_key = "sk-smoke-secret"\n\n[models.ds-chat]\nmodel = "deepseek-chat"\nprovider = "ds"\nmax_context_size = 65536\n`,
  'utf-8',
);

const harness = new ByfHarness({ homeDir: home });
const handle = await startWebServer({ port: 0, harness, publicDir: undefined });

const base = handle.url;
let failures = 0;
function check(name: string, cond: boolean, extra = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures += 1;
}

// 1) GET /api/config/raw:掩码 + revision
let res = await fetch(`${base}/api/config/raw`);
let body = (await res.json()) as { text: string; revision: string | null };
check('raw GET 200 + revision', res.status === 200 && typeof body.revision === 'string');
check(
  'raw 密钥已掩码',
  body.text.includes('__BYF_KEEP_SECRET__') && !body.text.includes('sk-smoke-secret'),
);
const rev1 = body.revision!;

// 2) 外部进程修改文件（模拟 TUI/CLI）→ 旧 revision 保存 409
const fs = await import('node:fs/promises');
await writeFile(
  configPath,
  (await fs.readFile(configPath, 'utf-8')) + '\n# touched by TUI\n',
  'utf-8',
);
res = await fetch(`${base}/api/config/raw`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: body.text, expectedRevision: rev1 }),
});
check('并发冲突 409', res.status === 409, `status=${res.status}`);
const errBody = (await res.json()) as { code: string };
check('409 code CONFIG_REVISION_CONFLICT', errBody.code === 'CONFIG_REVISION_CONFLICT');

// 3) 保存后注释保留（raw 全保真）
res = await fetch(`${base}/api/config/raw`);
const fresh = (await res.json()) as { text: string; revision: string | null };
check('外部修改可见（# touched by TUI 保留）', fresh.text.includes('# touched by TUI'));
res = await fetch(`${base}/api/config/raw`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ text: fresh.text + '# saved by web\n', expectedRevision: fresh.revision }),
});
check('raw 保存 200', res.status === 200, `status=${res.status}`);

// 4) 会话创建 → 全量列表 → 删除 → index 不再残留
res = await fetch(`${base}/api/sessions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ workDir: '/tmp' }),
});
const created = (await res.json()) as { session: { id: string } };
const sessionId = created.session.id;
check('create session 201', res.status === 201, sessionId);

res = await fetch(`${base}/api/sessions`);
const list = (await res.json()) as { sessions: unknown[] };
check(
  '全量列表含新会话',
  list.sessions.some((s: { sessionId: string }) => s.sessionId === sessionId),
);

res = await fetch(`${base}/api/sessions/${sessionId}/state`);
check('state 路由 200', res.status === 200);

// 5) live 会话删除 → 409 busy（POST 创建的会话是 live，busy 语义端到端验证）
res = await fetch(`${base}/api/sessions/${sessionId}`, { method: 'DELETE' });
const busyBody = (await res.json()) as { code?: string };
check(
  'live 会话删除 409 SESSION_BUSY',
  res.status === 409 && busyBody.code === 'SESSION_BUSY',
  `status=${res.status} code=${busyBody.code}`,
);

// 6) 非 live 会话（手工 seed 目录 + index）→ 删除 200 + index 重建
const seededId = 'session_seeded_1';
const seededDir = join(home, 'sessions', 'w', seededId);
await mkdir(seededDir, { recursive: true });
await fs.appendFile(
  join(home, 'session_index.jsonl'),
  `${JSON.stringify({ sessionId: seededId, sessionDir: seededDir, workDir: '/w' })}\n`,
  'utf-8',
);
res = await fetch(`${base}/api/sessions/${seededId}`, { method: 'DELETE' });
check('非 live 会话删除 200', res.status === 200, `status=${res.status}`);

const indexText = await fs.readFile(join(home, 'session_index.jsonl'), 'utf-8');
check(
  'index 不再残留已删 id（live 会话保留）',
  !indexText.includes(seededId) && indexText.includes(sessionId),
);

res = await fetch(`${base}/api/sessions`);
const list2 = (await res.json()) as { sessions: unknown[] };
check(
  '列表不含已删会话（live 保留）',
  !list2.sessions.some((s: { sessionId: string }) => s.sessionId === seededId) &&
    list2.sessions.some((s: { sessionId: string }) => s.sessionId === sessionId),
);

handle.close();
await harness.close();
await rm(home, { recursive: true, force: true });
console.log(failures === 0 ? 'SMOKE OK' : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
