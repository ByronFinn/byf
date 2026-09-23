# 0042 - Web 本地服务写门：能力分级、回环自动 token 与标记头契约

日期：2026-09-23

## 状态

已接受（记录 PRD-0038 R1 于 2026-09-21 合入 dev 的实现；取代 ADR 0034 D4 与 ADR 0036 D4 的「回环默认无 token」假设）

## 背景

PRD-0038 的安全侧盘点核实：web-server 的鉴权中间件**仅在配置了 token 时安装**，默认绑回环即完全不鉴权；全仓没有 Origin/CORS 校验；`c.req.json()` 不校验 Content-Type，表单式简单请求无预检即可到达；`/api/mcp/test` 把请求体的 stdio `command` 一路透传到 spawn。组合起来，一条「恶意网页 → 本机 4100 → 命令执行」的路径在默认配置（用户什么都没做）下就存在。DNS rebinding 进一步击穿「绑 127.0.0.1 即安全」的假设：浏览器可把攻击者域名解析到回环，此时攻击者页面的 Origin 与请求 Host 相同。

ADR 0034 D4 与 ADR 0036 D4 都把「回环默认无 token」当成不变假设。PRD-0038 Q1 裁决推翻它：「绑回环」不构成威胁模型边界，最小可信修复是**任何写操作都必须证明调用者意图**。本文记录落地的能力分级门、顺序理由与显式保留的残余面。

## 决策

### D1：四层门，顺序固定 Host → Content-Type → Origin/标记头 → token

实现在 `apps/web/server/src/app.ts`：`Host` 门挂在根中间件（读写与静态资产共用），其余三层在 `writeGateRejection` 内、只作用于非只读方法（只读 = GET/HEAD）。顺序是设计的一部分：

1. **`Host` 允许集合门**：`Host` 的主机名必须是 `localhost` / `127/8` 字面 IPv4 / `::1` 之一，或就是绑定主机本身（非回环绑定时再加上本机非内部 IPv4 网卡地址）；端口不参与判定，畸形与缺失一律拒绝（回退到 `c.req.url` 的主机名）。挂在根中间件、先于下面三层与 SPA 静态回退，因此**只读路径同样受约束**。理由：`Host` 是浏览器的 forbidden header，页面改不了它，只能由请求 URL 的主机名决定——于是"把攻击者域名解析到 127.0.0.1"的 rebinding 页面必然带着 `evil.test` 这个主机名而来，在这里就吃 403。Origin 门与它不是重复：`c.req.url` 的主机部分本身就来自请求的 `Host`，所以第 2 层的"同源"只有在第 1 层放行后才有意义。
2. **Content-Type 门**：带 body 的写必须是 `application/json`，否则 415（`UNSUPPORTED_MEDIA_TYPE`）。先挡「无预检的表单式简单请求」（`text/plain` / urlencoded / 缺失）——这类请求连不上真实客户端，没必要再看后面的门。无 body 的写不经过此门，避免误杀。
3. **Origin/标记头门**：显式跨源 `Origin` 一律 403——**即使带着标记头**（标记头不是跨源豁免）；无 `Origin` 的非浏览器调用者必须自带 `x-byf-requested-with`，否则 403。
4. **token 门**：只有「形态合法的写」才值得一次凭证挑战（401 + `www-authenticate: Bearer realm="byf-web"`）。这让各种失败凭证落点收敛在同一个 401 响应上。

四层都是纯判定，拒绝直接返回结构化 4xx、不进入路由，因此「同时命中两层的坏请求」也只是被前一层拒掉，不会抛成 500。token 比对用 `timingSafeEqual`；`Authorization: Bearer` 与 `?token=` 查询并列接受（EventSource 带不了 header）。

### D2：回环自动 token；非回环仍强制配置

`resolveAuthToken`（`app.ts`）：显式配置值优先（`explicit: true`）；未配置时 `generateAuthToken()` 每次启动生成一个随机 token（48 位十六进制）。交付面是启动横幅的 `token=...`、CLI 自动打开 URL 的 `?token=`，以及非回环绑定时 LAN 行的完整 URL（`startup-banner.ts`、`apps/cli/src/cli/sub/web.ts`）。LAN 语义不变：非回环绑定未配置 `WEB_AUTH_TOKEN` 直接启动失败（`config.ts` 的 `resolveWebAuthToken` 抛错；`byf web` 捕获后打印设置指引并以退出码 1 结束）。

### D3：只读免 token 只属于回环自动 token 模式

免 token 的边界是「未显式配置 token 时的 GET/HEAD」——存在的理由是 SPA 首屏与 SSE 事件流（静态资产本来也不鉴权）。一旦显式配置 token（LAN 模式），读写一律要求凭证。换句话说，「回环自动 token」模式下豁免的是**读**，不是回环本身：**所有写在任何模式下都要求 token**。

### D4：标记头契约 = 证明调用意图，不证明身份

`x-byf-requested-with` 是非浏览器调用者（本机脚本 / 集成方）声明「这是 byf 客户端在有意调用」的契约头；浏览器同源写请求由 Origin 门放行，不需要它。它可被任何本机进程轻易伪造——这是有意的：本机进程从来不在本门的威胁模型里（能起本机进程 ≈ 已拥有本机）。门要区分的是「有意的 byf 客户端」与「别人驱动你的浏览器」。

### D5：`/api/mcp/test` 的 stdio 命令白名单

请求体指定的 stdio `command` 必须出现在任一 scope 的已保存 MCP 配置里，否则拒绝且不 spawn 任何进程。强制点在 `packages/agent-core/src/rpc/host-rpc.ts` 的 `testMcpConnection`——真正唯一的 spawn 收口处，因此 SDK 公开面、未来的 TUI/CLI 入口都过同一道门；`routes.ts` 里那份是提前短路（省一次无用的 harness 往返），重复的原因是 ADR-0006 的分层让 web-server 运行时拿不到 core 实现。未保存的配置仍可测（填完先测再存是真实需求），但命令来源从「请求体任意值」收窄到「本机已声明过的集合」；两个 scope 都空时默认拒绝而非默认放行；绝对路径不因 basename 撞名单而漏；http/sse transport 不经过此门。这条与 D1-D3 互补：D1-D3 挡跨站形态，此条把即使来自合法调用者的「测任意命令」等价 RCE 也收掉。

**它不约束什么**：`args` / `env` / `cwd` 仍由调用方决定，所以已保存配置里出现过 `node`、`python`、`sh` 时，配任意 `args` 依旧是本机代码执行。收紧到 `args` 需要先改 PRD-0038 的 AC-1.3——它明确要求保住"保存前测试"这条旅程，而用户在表单里先测再存改的恰恰是 args。另需记清：`/api/mcp/test` 是 POST，回环写操作一直要求 token，所以这条链从来不是免凭证的；本次真正补上的是"入口只有 route 一层"和"默认方向"，不是"从可 RCE 变成不可 RCE"。

## 后果

### 正面

- 「跨站简单请求 → 本机命令执行」这条核实过的路径被闭合：坏形态在第 1–3 层就被拒，够不到 spawn；形态合法但无凭证的写吃 401。
- 默认配置（用户没设任何 token）不再是免鉴权写区；回环体验只多了一次「横幅/URL 里有 token」的可见成本。
- 契约头让 headless/CLI 调用者的语义显式化，失败响应（415/403/401）各有结构化 code，可诊断。

### 负面 / 显式保留的残余面

- **只读回环 GET 仍不需要任何凭证**——但跨站**读**在 D1 第 1 层被拒：rebinding 页面无法把请求的 `Host` 改成本机名（forbidden header，只能由 URL 决定），带 `evil.test` 就吃 403，前缀撞名（`127.0.0.1.attacker.test`、`127.0.0.1.nip.io`）与重复 `Host` 头同样被拒。本文关的是跨站**写与命令执行**，加上 Host 门之后跨站读也一并关掉了；仍不闭合的是下面这条本机信任前提。
- **本机端口转发等于把免凭证只读交给对端机器**：`ssh -L 4100:127.0.0.1:4100` 之后对端浏览器的 `Host` 就是 `localhost:4100`，落在允许集合内。这归入「本机进程与转发等同本机信任」的既有前提（D4 已就标记头说过同一件事），不是这一面能解决的；写仍需要 token。
- 反代与自定义主机名（mDNS、`/etc/hosts`）会被 Host 门**拒绝**——功能代价，不是绕过口。
- token 进入启动 URL、终端回滚缓冲与浏览器历史——ADR 0036 D1 已为非回环接受此代价，本文把它扩展到回环（非回环绑定的 LAN 横幅附带"建议用后轮换 `WEB_AUTH_TOKEN`"提示；回环自动 token 因每次启动更换、重启即失效，未另加轮换文案）。
- 按 ADR 0033 立场，以上所有层仍是 best-effort 的意图证明，不是安全边界；不受信任务的隔离归用户容器/VM。

## 备选

- **一律 401（读写全部要求凭证）**：Q1 明确考虑后否决——只读也要凭证会破坏静态 SPA 首屏（首次访问还没有任何凭证）与 SSE（EventSource 带不了 `Authorization` 头）。落地形态是 Q1 原文的「能力分级」：写一律要求，只读按模式豁免。
- **回环保持免鉴权（仅非回环要求 token）**：ADR 0034 D4 / ADR 0036 D4 的旧假设。否决——「绑回环」不构成威胁模型边界（DNS rebinding + 无预检跨站请求），这正是 R1 要关的写面。

## 引用

- PRD-0038（Q1/Q3 裁决、AC-1.1 / AC-1.2 / AC-1.3；背景中列出的核实事实）
- ADR 0033（权限/意图层是 UX guard，不是安全边界）
- ADR 0034 D4、ADR 0036 D1/D4（被本文取代与被本文沿用的两代假设）
- ADR 0038 / 0039（配置与 mcp.json 的密钥掩码——同批 R1 中不属本文的部分）
- 实现：`apps/web/server/src/app.ts`（四层门、auto token、标记头契约）、`apps/web/server/src/config.ts`（`resolveWebAuthToken`）、`apps/web/server/src/startup-banner.ts`（交付面与轮换提示）、`apps/web/server/src/routes.ts` 与 `packages/agent-core/src/rpc/host-rpc.ts`（`/api/mcp/test` 白名单的短路层与收口层）、`apps/cli/src/cli/sub/web.ts`（CLI 侧交付）
- 用户文档：`docs/{en,zh}/configuration/env-vars.md`（`WEB_AUTH_TOKEN`）、`SECURITY.md`「本地 HTTP 服务」
