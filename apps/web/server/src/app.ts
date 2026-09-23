import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isIPv4, isIPv6 } from 'node:net';
import { networkInterfaces } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { Hono } from 'hono';
import type { Context } from 'hono';

import { isLoopbackHost, resolveByfHome, resolveHost } from './config';
import { createApiRouter } from './routes';
import { SessionNotFoundError, type WebSessionManager } from './session-manager';

/** SPA bundle 目录解析(旁置 bundle / 开发态返回 null)。镜像 apps/vis/server。 */
async function resolvePublicDir(): Promise<string | null> {
  try {
    const here = import.meta.dirname;
    const candidate = resolve(here, 'public');
    const s = await stat(candidate);
    if (s.isDirectory()) return candidate;
  } catch {
    // not present
  }
  return null;
}

/**
 * `@byfriends/cli` 原生编译二进制经 `bun build --compile` 内嵌 SPA 资产
 * (见 apps/cli/scripts/compile/build.mjs)。每条是 `Map<relativePath, virtualPath>`,
 * 值是 `Bun.file()` 可直接读的 `/$bunfs/...` 路径。源码/JS bundle 布局下此全局
 * 不存在,返回 `null`。
 */
function resolveEmbeddedAssets(): Map<string, string> | null {
  const raw = (globalThis as Record<string, unknown>)['__BYF_WEB_EMBEDDED_ASSETS__'];
  if (!(raw instanceof Map)) return null;
  return raw;
}

type StaticSource =
  | { readonly kind: 'disk'; readonly publicDir: string }
  | { readonly kind: 'embedded'; readonly assets: Map<string, string> };

async function resolveStaticSource(publicDir: string | undefined): Promise<StaticSource | null> {
  if (publicDir !== undefined) {
    try {
      const s = await stat(publicDir);
      if (s.isDirectory()) return { kind: 'disk', publicDir };
    } catch {
      // fall through
    }
  }
  const embedded = resolveEmbeddedAssets();
  if (embedded !== null && embedded.size > 0) return { kind: 'embedded', assets: embedded };
  const disk = await resolvePublicDir();
  if (disk !== null) return { kind: 'disk', publicDir: disk };
  return null;
}

const STATIC_EXT_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function mimeFor(path: string): string {
  const i = path.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  const ext = path.slice(i).toLowerCase();
  return STATIC_EXT_MIME[ext] ?? 'application/octet-stream';
}

function bearerToken(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() ?? null;
}

function tokenMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** EventSource 无法设置 Authorization 头,故 token 同时接受 Bearer 头与 `?token=` 查询。 */
function isAuthorized(
  authorization: string | undefined,
  queryToken: string | undefined,
  expected: string,
): boolean {
  const bearer = bearerToken(authorization);
  if (bearer !== null && tokenMatches(bearer, expected)) return true;
  if (queryToken !== undefined && queryToken.length > 0 && tokenMatches(queryToken, expected))
    return true;
  return false;
}

/** 回环自动 token 的生成(每次启动一个;经启动日志与 CLI 打开的 URL 交付)。 */
function generateAuthToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * 生效 token:显式配置值(LAN 模式必填)优先,否则本次启动生成回环 token。
 * `explicit` 决定只读请求是否免 token——免 token 只属于回环自动 token。
 */
function resolveAuthToken(configured: string | undefined): {
  token: string;
  explicit: boolean;
} {
  if (configured !== undefined && configured.length > 0) {
    return { token: configured, explicit: true };
  }
  return { token: generateAuthToken(), explicit: false };
}

/**
 * 非浏览器调用者(本机 CLI / 脚本 / 自动化)表明"这是 byf 客户端在有意调用"的标记头。
 * 浏览器同源请求由 Origin 门放行,不需要它。
 */
export const BYF_REQUESTED_WITH_HEADER = 'x-byf-requested-with';

/** 只读方法(SPA 首屏与 SSE 事件流走 GET)。 */
function isReadOnlyMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/** Content-Type 门只作用于"带 body 的写":无 body 的 DELETE/POST 不该被它误杀。 */
function hasRequestBody(request: Request): boolean {
  return request.body !== null;
}

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.split(';', 1)[0]!.trim().toLowerCase() === 'application/json';
}

/**
 * Origin 与请求自身同源(比较 host;缺端口按协议默认补全)。
 *
 * 这个比较的前提是 `c.req.url` 的主机名可信,而它恰恰来自请求自带的 `Host` 头——
 * 所以本函数只有在 {@link hostGateRejection} 已经放行之后才有意义,单独调用它不构成
 * 跨站判定(DNS rebinding 下攻击者能同时决定 Origin 与 Host)。
 */
function isSameOrigin(origin: string, requestUrl: string): boolean {
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

/**
 * 请求主机名是不是"真的回环"。刻意比 `config.isLoopbackHost` 严格:后者分类的是
 * **配置里写的绑定地址**(字符串 `127.x` 在那个语境下没有歧义),而这里分类的是
 * **网络输入**——`127.0.0.1.attacker.example` 这类域名解析服务可以把名字指到
 * 127.0.0.1,而它按字符串前缀看也是 "127." 开头。所以回环只认三种形态:
 * `localhost`、`127/8` 的**字面 IPv4**、`::1` 的**字面 IPv6**。
 */
function isLoopbackRequestHost(host: string): boolean {
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  return isIPv4(host) && host.startsWith('127.');
}

/**
 * 把 `Host` 头规范化为**裸主机名**:小写、去 IPv6 方括号、去端口、去根点。
 * 只对**格式良好**的值返回结果,其余一律 `null` 交给拒绝分支——宁可拒一个合法的怪
 * 写法,也不能"取前段"把可疑值洗成合法主机名:重复 `Host` 头会被 HTTP 栈拼成
 * `127.0.0.1:4100, evil.test` 这种形态,按第一个冒号截断就会把它读成 `127.0.0.1`。
 */
function normalizeRequestHost(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value.length === 0) return null;
  // 逗号 = 重复头拼接;空白 / `/` / `\` 不是任何主机名语法的一部分。
  if (/[,\s/\\]/.test(value)) return null;
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    if (end === -1) return null;
    const rest = value.slice(end + 1);
    if (rest.length > 0 && !/^:\d{1,5}$/.test(rest)) return null;
    const host = value.slice(1, end);
    return host.length === 0 ? null : host;
  }
  const first = value.indexOf(':');
  if (first !== -1) {
    if (value.includes(':', first + 1)) {
      // 多个冒号且不带方括号:裸 IPv6 字面量(`::1`)。除此之外不按"主机:端口"解析。
      return isIPv6(value) ? stripRootDot(value) : null;
    }
    const port = value.slice(first + 1);
    if (!/^\d{1,5}$/.test(port)) return null;
    return stripRootDot(value.slice(0, first));
  }
  return stripRootDot(value);
}

function stripRootDot(host: string): string | null {
  const trimmedDot = host.endsWith('.') ? host.slice(0, -1) : host;
  return trimmedDot.length === 0 ? null : trimmedDot;
}

/**
 * 本机能合法应答的主机名集合(端口无关)。回环名不在这里——{@link hostGateRejection}
 * 用 {@link isLoopbackRequestHost} 判定,所以 `localhost` / `127/8` 字面量 / `::1`
 * 恒可。
 *
 * 这里只补两类"服务器确实绑到的地址":绑定主机本身,以及非回环绑定时本机网卡
 * 地址(LAN 访问 URL 由启动 banner 按同一批地址交付,不接受它们就等于 banner 说谎)。
 */
function allowedRequestHosts(bindHost: string, lanHosts: readonly string[]): Set<string> {
  const hosts = new Set<string>();
  const bound = normalizeRequestHost(bindHost);
  if (bound !== null) hosts.add(bound);
  if (!isLoopbackHost(bindHost)) {
    for (const candidate of lanHosts) {
      const host = normalizeRequestHost(candidate);
      if (host !== null) hosts.add(host);
    }
  }
  return hosts;
}

/** 非回环绑定时并入允许集合的本机网卡地址(IPv4 + IPv6,排除 internal)。 */
function interfaceHosts(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (!entry.internal) addresses.push(entry.address);
    }
  }
  return addresses;
}

/**
 * PRD-0038 AC-1.1：`Host` 允许集合门（对 DNS rebinding 的唯一有效对策）。
 *
 * 为什么必须有这道门：`c.req.url` 的主机部分是 Bun 从请求自带的 `Host` 头拼出来
 * 的，于是 {@link isSameOrigin} 的"同源"比较变成了拿攻击者写的 A 和攻击者写的 A
 * 比——一个把域名指到 127.0.0.1 的页面发 `Host: evil.test:4100` +
 * `Origin: http://evil.test:4100` 必然"同源"。而只读 GET 在回环自动 token 下免
 * 凭证，所以那一次"同源"就足够把 `/api/files`（工作区内任意文件，含 `.env`）和
 * `/api/sessions/:id/wire`（完整提示词与工具载荷）读空。
 *
 * 判定与请求方是谁无关：主机名必须是本机实际绑定/可达的地址，否则一律 403。
 * 它跑在写门与只读免 token 豁免**之前**，因此读写两条路径同时被覆盖。
 *
 * 诚实边界（ADR-0033：这是尽力而为的护栏，不是沙箱）：
 * - 端口不参与判定（rebinding 下攻击者改不了主机名，改不改端口都一样；而 dev 态
 *   vite 代理会保留 client 端口的 Host，见 web-server.test.ts 的 dev flow 用例）。
 * - 本机进程仍可随意伪造 `Host`——它本来就有回环网络与文件系统的直接访问权，
 *   这道门不针对它（威胁模型见 SECURITY.md）。
 * - 不禁止 `Host: localhost`：那是用户自己的浏览器访问本机服务的方式；攻击者的页面
 *   发不出这个头——`Host` 是 forbidden header name，只能由 URL 决定。
 *
 * `Host` 头缺失时回退到 `c.req.url` 的主机名：真实 HTTP 流量必带 `Host`，走到回退
 * 的只有 Hono `app.request('/api/…')` 这类进程内合成请求——它不带该头，主机名只存在
 * 于调用方自己构造的 URL 里，不是网络输入。
 */
function hostGateRejection(c: Context, allowedHosts: ReadonlySet<string>): Response | null {
  const rawHost = c.req.header('host');
  const candidate = rawHost ?? urlHost(c.req.url);
  const host = candidate === null ? null : normalizeRequestHost(candidate);
  if (host !== null && (isLoopbackRequestHost(host) || allowedHosts.has(host))) return null;
  return c.json(
    {
      error:
        `host not allowed: ${host ?? 'unparseable'} (this server only answers on the ` +
        'address it is bound to)',
      code: 'FORBIDDEN',
    },
    403,
  );
}

function urlHost(requestUrl: string): string | null {
  try {
    return new URL(requestUrl).host;
  } catch {
    return null;
  }
}

/**
 * PRD-0038 AC-1.1 的跨站简单请求门(写请求专用)。返回 `null` 表示放行。
 *
 * 完整顺序固定为 Host → Content-Type → Origin/标记头 → token,其中 Host 门在
 * {@link createApp} 的根中间件里(它必须同时挡住只读豁免路径)。本函数是后三层:
 * - 先 Content-Type:阻断"无预检的表单式简单请求"(text/plain / urlencoded / 缺失),
 *   这类请求连不上真实客户端,没必要再看后面的门。
 * - 再 Origin/标记头:显式跨源 Origin 一律拒绝(即使带标记头——标记头不是跨源豁免);
 *   无 Origin 的非浏览器调用者必须自带标记头(Q1 条件 2)。这里的 Origin 比较之所以
 *   成立,是因为 Host 门已经把 `c.req.url` 的主机名钉在本机地址上。
 * - 最后 token:只有"形态合法的写"才值得一次凭证挑战(401 + `www-authenticate`),
 *   也让 #11 的 5 种失败凭证落在同一个响应体上。
 * 每一层都是纯判定,任何一层拒绝都直接结构化 4xx,不进入路由,因此"无 token 且无标记头"
 * 这类组合同时命中两层时也只是被前一层拒绝,不会抛错成 500。
 */
function writeGateRejection(c: Context): Response | null {
  if (hasRequestBody(c.req.raw) && !isJsonContentType(c.req.header('content-type'))) {
    return c.json(
      {
        error: 'write requests require Content-Type: application/json',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      },
      415,
    );
  }
  const origin = c.req.header('origin');
  if (origin !== undefined && !isSameOrigin(origin, c.req.url)) {
    return c.json({ error: 'cross-origin request rejected', code: 'FORBIDDEN' }, 403);
  }
  const marker = c.req.header(BYF_REQUESTED_WITH_HEADER);
  if (origin === undefined && (marker === undefined || marker.length === 0)) {
    return c.json(
      {
        error: `missing ${BYF_REQUESTED_WITH_HEADER} marker header (required for non-browser callers)`,
        code: 'FORBIDDEN',
      },
      403,
    );
  }
  return null;
}

export interface CreateAppOptions {
  readonly manager: WebSessionManager;
  /**
   * 鉴权 token。省略时(回环默认)由本次启动随机生成一个,并经 {@link
   * CreateAppResult.authToken} 交付给启动日志与 CLI。
   */
  readonly authToken?: string;
  /** 持有构建后 SPA 资产的目录;省略时自动探测。 */
  readonly publicDir?: string;
  /** byf home 目录(工作区注册表 / 会话索引所在);默认 `resolveByfHome()`。 */
  readonly homeDir?: string;
  /**
   * 服务器**实际绑定**的地址,`Host` 允许集合据此构造(PRD-0038 AC-1.1);
   * 省略时取 `resolveHost()`(与 `startWebServer` 的默认解析一致)。
   */
  readonly bindHost?: string;
  /**
   * 非回环绑定时并入 `Host` 允许集合的本机地址;省略时读 `os.networkInterfaces()`
   * (回环绑定不会用到它,因此也不会触发这次系统调用)。
   */
  readonly lanHosts?: readonly string[];
}

export interface CreateAppResult {
  readonly app: Hono;
  readonly staticEnabled: boolean;
  /** 实际生效的 token:显式配置值,或本次启动自动生成的回环 token。 */
  readonly authToken: string;
}

/** 构建 Hono 应用:`/api/*` 路由 + 安全门 + SPA 静态回退。 */
export async function createApp(options: CreateAppOptions): Promise<CreateAppResult> {
  const app = new Hono();

  // `Host` 门挂在根中间件上、先于 `/api` 挂载与 SPA 静态回退:写门、只读免 token
  // 豁免、静态资产三条路径共用同一个"这台机器只应答自己绑定的地址"判定。
  const bindHost = options.bindHost ?? resolveHost();
  const allowedHosts = allowedRequestHosts(
    bindHost,
    options.lanHosts ?? (isLoopbackHost(bindHost) ? [] : interfaceHosts()),
  );
  app.use('*', async (c, next) => {
    const rejection = hostGateRejection(c, allowedHosts);
    if (rejection !== null) return rejection;
    await next();
  });

  const api = new Hono();
  const { token: authToken, explicit } = resolveAuthToken(options.authToken);
  api.use('*', async (c, next) => {
    const readOnly = isReadOnlyMethod(c.req.method);
    if (!readOnly) {
      const rejection = writeGateRejection(c);
      if (rejection !== null) return rejection;
    }
    // 只读免 token 只属于"未显式配置 token 的回环自动 token"(免 token 是为了不破坏
    // SPA 首屏);显式配置 token(LAN 模式)时一律要求凭证。
    if (!(readOnly && !explicit)) {
      if (isAuthorized(c.req.header('authorization'), c.req.query('token'), authToken)) {
        await next();
        return;
      }
      c.header('www-authenticate', 'Bearer realm="byf-web"');
      return c.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  });
  api.route('/', createApiRouter(options.manager, options.homeDir ?? resolveByfHome()));
  app.route('/api', api);

  app.onError((err, c) => {
    // SessionNotFoundError 或携带 session.not_found 错误码的 ByfError(经 RPC
    // 序列化后丢失类身份,如 PATCH /sessions/:id 与 fork 对不存在会话)→ 404。
    const code = (err as { code?: unknown }).code;
    if (err instanceof SessionNotFoundError || code === 'session.not_found') {
      const message = err instanceof Error ? err.message : 'session not found';
      return c.json({ error: message, code: 'NOT_FOUND' }, 404);
    }
    const message = err instanceof Error ? err.message : 'internal error';
    return c.json({ error: message, code: 'INTERNAL' }, 500);
  });

  const staticSource = await resolveStaticSource(options.publicDir);
  if (staticSource === null) {
    if (options.publicDir !== undefined) {
      // 调用方显式要求内置 SPA 但路径不可用:配置错误,值得一条 stderr 诊断。
      process.stderr.write(
        `[web-server] publicDir not found or not a directory: ${options.publicDir}; ` +
          'serving API only (/api/*).\n',
      );
    } else {
      // 未显式指定:api-only 是设计上的 fallback(dev 由 vite 提供前端;CLI /
      // 独立部署需先构建)。用 stdout 说明而非 stderr 警告,避免被误读为启动失败。
      process.stdout.write(
        '[web-server] serving API only (/api/*): SPA bundle not found. ' +
          'Dev frontend: `bun run --cwd apps/web/client dev` (vite). ' +
          'Self-contained: run `bun run build:web` first.\n',
      );
    }
  } else if (staticSource.kind === 'embedded') {
    const assets = staticSource.assets;
    app.get('*', (c) => {
      const url = new URL(c.req.url);
      const rawPath = decodeURIComponent(url.pathname);
      if (rawPath.startsWith('/api')) {
        return c.json({ error: `api route not found: ${rawPath}`, code: 'NOT_FOUND' }, 404);
      }
      const rel = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\//, '');
      const direct = assets.get(rel);
      if (direct !== undefined) {
        return new Response(Bun.file(direct), { headers: { 'content-type': mimeFor(rel) } });
      }
      const indexVpath = assets.get('index.html');
      if (indexVpath === undefined) return c.text('not found', 404);
      return new Response(Bun.file(indexVpath), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
  } else {
    // 基准目录先规范化:调用方传相对 publicDir 时,下面的前缀比较才会和 `resolve()`
    // 的结果处在同一个坐标系里。
    const publicDir = resolve(staticSource.publicDir);
    app.get('*', async (c) => {
      const url = new URL(c.req.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api')) {
        return c.json({ error: `api route not found: ${pathname}`, code: 'NOT_FOUND' }, 404);
      }
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const resolved = resolve(publicDir, `.${pathname}`);
      // 分隔符是判定的一部分:只比 `publicDir` 会让兄弟目录 `/x/public-evil/…` 因为
      // 前缀撞上 `/x/public` 而被当成目录内文件放行(与 `/fs/list` 的
      // `target !== base && !target.startsWith(`${base}${sep}`)` 同一判据)。
      if (resolved !== publicDir && !resolved.startsWith(`${publicDir}${sep}`)) {
        return c.text('forbidden', 403);
      }
      try {
        const s = await stat(resolved);
        if (s.isFile()) {
          const buf = await readFile(resolved);
          const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          return new Response(body, { headers: { 'content-type': mimeFor(resolved) } });
        }
      } catch {
        // fall through to SPA fallback
      }
      try {
        const indexHtml = await readFile(join(publicDir, 'index.html'));
        const body = new Uint8Array(indexHtml.buffer, indexHtml.byteOffset, indexHtml.byteLength);
        return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      } catch {
        return c.text('not found', 404);
      }
    });
  }

  return { app, staticEnabled: staticSource !== null, authToken };
}
