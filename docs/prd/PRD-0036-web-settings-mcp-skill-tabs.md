# Web 设置页新增 MCP 配置与 Skill 配置页签(全局/本地双 scope)

> **Status**: Done | **PRD**: PRD-0036 | **Created**: 2026-08-18 | **Last updated**: 2026-08-18(implement + review)

## Goal

Web 工作台设置弹层(`SettingsDialog`)左侧导航新增「MCP 配置」与「Skill 配置」两个页签。两者都按 **全局(`~/.byf`)** 与 **本地(工作区 `.byf`)** 两个 scope 分组:MCP server 支持完整增删改与 enabled 开关;Skill 支持分组列表、模板新建、删除。为此补齐 agent-core 对 `mcp.json` 的按 scope 读写能力与工作区级 skill 枚举/创建/删除能力,沿 core → RPC → SDK → web-server 的既有分层全链路透出。

## What I already know

### MCP 配置现状

- 配置文件两层:全局 `~/.byf/mcp.json`(受 `BYF_HOME` 影响)与本地 `<工作区>/.byf/mcp.json`;格式 `{ "mcpServers": { [name]: McpServerConfig } }`;同名时**本地覆盖全局**(`packages/agent-core/src/mcp/config-loader.ts:24-52`)。
- schema(`packages/agent-core/src/config/schema.ts:162-221`):transport 为 stdio/http/sse 判别联合(无 transport 时由 `command`/`url` 推断);公共字段含 `enabled?: boolean`、`startupTimeoutMs`、`toolTimeoutMs`、`enabledTools[]`、`disabledTools[]`。
- `loadMcpServers` 是浅合并读取,**生产代码从不写 mcp.json**;无按 scope 分别列出的 API。
- mcp.json 在会话创建/恢复时经 `resolveSessionMcpConfig` 加载(`rpc/core-impl.ts:217,333`),改动只对新会话生效;运行时 `enabled === false` 表现为 `disabled` 状态(`mcp/connection-manager.ts:177`)。
- 项目本地 mcp.json 会在会话启动时执行其声明的 stdio 命令——docs 已有信任警告(`docs/en/customization/mcp.md`)。

### Skill 配置现状

- skill 无配置文件,skill 有**两种形态**(`skill/scanner.ts:113-204`):目录 bundle(`<dir>/SKILL.md`,不向下扫描)与 root 顶层的单文件 `<name>.md`;parser 中 name 缺省取目录名、description 缺省取正文首行,frontmatter 要求极轻(name 非空且非纯数字,`skill/parser.ts:142,149,214`)。
- 无 per-skill enable/disable 持久化;仅有的全局行为开关 `mergeAllAvailableSkills` / `extraSkillDirs` 在 `~/.byf/config.toml`。
- `resolveSkillRoots` / `discoverSkills` 已可独立于 Session 调用(`skill/scanner.ts:51,113`),`SkillDefinition` 带来源 root 信息;`SkillSummary.source` 已区分 `'builtin'|'user'|'extra'|'project'`。
- Web 已有会话级 `GET /api/sessions/:id/skills`(slash 面板数据源),但无工作区级枚举、无创建/删除。

### 路径与安全先例(grill 2026-08-18 补)

- **「本地」目录在两页签不对称**:MCP 本地 = `<workDir>/.byf/mcp.json`(直接用工作区目录);skill 本地根 = 最近含 `.git` 的祖先(`findProjectRoot`,无 `.git` 时回退 workDir 本身)。monorepo 子目录作工作区时两者可能不同——UI 必须分别显示实际路径。
- 路径校验先例:「作用域白名单文件端点」(CONTEXT.md / ADR-0036)——realpath 规范化后仅允许已注册工作区根前缀;新端点的 `workDir` 必须 ∈ 已注册工作区,skill 删除路径必须 realpath 后落在允许根内,防路径穿越。
- 鉴权:`/api` 全量走可选 token 中间件(回环默认无鉴权,非回环必填)——密钥回显策略须与 ADR-0036(只写不读)/ ADR-0038(掩码 round-trip)纪律对齐。
- RPC 形态:`SDKRpcClient` 在**进程内**包裹 `CoreAPI`(`createRPC` 异步边界,非 wire 协议);新增方法 = `CoreAPI` 接口 + `core-impl` 实现 + `SDKRpcClient` 透传,照抄 `validateConfigText` 的三层样板。

### Web 端现状

- 设置弹层为左侧导航 + 右侧 section(`apps/web/client/src/components/layout/SettingsDialog.tsx`),现有分区:通用/模型与 Provider/权限/运行与服务/配置文件/归档管理——加两个页签结构顺滑。
- Web 为多工作区架构(会话各带 `workDir`,`GET/POST/DELETE /api/workspaces`);无全局「当前工作区」状态,「本地」scope 需要工作区选择。
- 配置类端点的分层链路:web-server `session-manager` → SDK `ByfHarness`(`byf-harness.ts`)→ RPC(`rpc.ts` → core `rpc/core-impl.ts`);raw 配置端点(PRAD-0035 / ADR-0038)提供了「损坏文件 200 + invalid 标志 + 校验后落盘」的成熟兜底模式。
- 原子写先例:`config/toml.ts`、`config/workspace-local.ts`(`<项目根>/.byf/local.toml` 是现存的唯一可写项目级配置文件)。

## Assumptions (temporary)

(grill 2026-08-18:两条假设均已裁决——)

- ~~单用户本地工具,mcp.json 写入不做 revision 乐观锁~~ → **已决议**:不做,记入 Decision 与 ADR-0039 D5。
- ~~「新建 skill」只写 `.byf` 目录~~ → **已验证并扩展**:`.agents/skills` 全量只读(含删除),理由是跨工具共享目录。

## Open Questions

(无——关键决策已在 /think 对话中收敛,见 Decision;余下留待 /grill 复核。)

## Requirements

### 设置页导航与共享交互

- R-N1 设置弹层左侧导航新增「MCP 配置」「Skill 配置」两个入口,右侧对应 section;导航顺序放在「运行与服务」之后、「配置文件」之前。
- R-N2 「本地」scope 需要目标工作区:默认取当前活跃会话的 `workDir`,无活跃会话时回退到第一个已注册工作区;两组件共享一个工作区下拉(可切换到任意已注册工作区);无任何已注册工作区时本地组显示空态并引导先注册工作区。「全局」组与工作区无关。
- R-N3 两个页签均显示生效语义说明:MCP 改动对新会话生效;skill 新建/删除影响下次会话加载。
- R-N4 两页签的本地组分别显示实际文件/扫描路径(MCP 与 skill 的本地根可能不同,见 Technical Notes 不对称说明)。

### MCP 配置页签

- R-M1 列表按「全局(`~/.byf/mcp.json`)」「本地(`<工作区>/.byf/mcp.json`)」两组展示:server 名、transport 摘要(stdio 命令 / URL)、enabled 状态、文件路径。
- R-M2 新增/编辑表单覆盖**常用字段**:name(创建后不可变,改名 = 删除 + 新建)、transport(stdio:command/args/env;http/sse:url/headers)、enabled;高级字段(enabledTools/disabledTools/startupTimeoutMs/toolTimeoutMs)不进表单。
- R-M2a **密钥掩码 round-trip**(grill 决议,对齐 ADR-0036/0038 纪律):`env` 与 `headers` 的值在所有 API 响应中以占位符回显(如 `__MCP_MASKED_1__`);表单中值字段显示占位符,用户不动 = 保留磁盘原值,输入新值 = 覆盖;服务端 upsert/写盘前必须把占位符还原为磁盘原值——**占位符字符串永不落盘**(enabled 开关等一键写盘路径同样过还原逻辑)。
- R-M3 删除 server 带确认弹窗;enabled 开关切换即时写盘。
- R-M3a 表单保存为**字段级合并**:表单未覆盖的高级字段(enabledTools 等)保留磁盘原值不丢失;transport 切换时丢弃旧 transport 专属字段(command/args/env ↔ url/headers)。
- R-M4 同名冲突:本地覆盖全局时,全局条目显示「被本地覆盖」标记;两份定义都保留、可分别编辑删除。
- R-M5 损坏兜底:某 scope 的 mcp.json JSON/schema 解析失败时,该组显示错误态与文件路径,并提供**页内 RAW JSON 文本域**编辑;损坏文件无法解析则无法掩码,RAW 显示磁盘原文(不 blank,否则用户丢失待修内容);校验通过才可保存,合法文件的 RAW 同样走掩码 round-trip(parse → mask → 规范化 serialize,JSON 无注释,格式归一可接受)。
- R-M6 在本地组新建/编辑 server 时显示信任提示:项目 mcp.json 会在会话启动时执行其声明的命令,仅在你信任的工作区启用。

### Skill 配置页签

- R-S1 列表按「全局」「本地(工作区)」两组列出各 skill root 发现的 skill:名称、描述、所在目录、内置/额外来源标记;被遮蔽的 skill 显示遮蔽标记;`.agents/skills` 来源(跨工具共享目录)标注只读。
- R-S2 新建 skill:选择 scope(全局 → `~/.byf/skills`;本地 → `<项目根>/.byf/skills`),以模板生成 SKILL.md(frontmatter name/description + 正文骨架);同 scope 同名(按 normalizeSkillName)报错;跨 scope 同名允许但提示「将遮蔽全局同名 skill」。目录 bundle 形态(SKILL.md),不生成单文件形态。
- R-S3 删除 skill 带二次确认;仅允许删除 user/project 来源且位于 byf 自有目录(`.byf/skills`)的 skill;**支持目录 bundle 与 root 顶层单文件两种形态**(分别删除目录/文件);builtin/extra 来源只读展示并说明原因。
- R-S4 编辑 SKILL.md 不做内嵌编辑器:提供路径复制,用户沿用文件端点或外部编辑器。

### 核心层与服务端

- R-C1 agent-core 新增 mcp.json **按 scope 读写服务**(新模块 `mcp/config-store.ts`):分别读取 user/project 两个文件(含每条目 scope 归属)、upsert、remove、raw 文本读写;写入走 tmp+rename 原子写;校验复用 `McpJsonFileSchema`;内含 `maskMcpSecrets`/`restoreMcpSecrets`(JSON 树遍历掩码 `env`/`headers` 值,占位符还原,比 TOML 正则简单)。
- R-C2 agent-core 提供工作区级 skill 枚举(复用 `resolveSkillRoots`/`discoverSkills`,不传 explicitDirs)、skill 创建(模板写 SKILL.md)与删除(限定 user/project 的 byf 目录)。
- R-C3 新能力经 RPC(`rpc/core-api.ts` `CoreAPI` 接口 + `core-impl.ts` 实现 + `SDKRpcClient` 透传,进程内异步边界,照抄 `validateConfigText` 样板);web-server 新增 REST 端点(挂 `/api`,命名对齐现有风格)。
- R-C4 `apps/web/shared` 补充对应 wire DTO;client 侧新增 `api.ts` 方法与两个 section 组件。
- R-C5 路径硬约束(对齐「作用域白名单文件端点」先例):端点收到的 `workDir` 必须 ∈ 已注册工作区;skill 删除路径服务端 realpath 规范化后必须落在允许根(全局 `~/.byf/skills` / 所选工作区项目根 `.byf/skills`)前缀内,防路径穿越。

## Acceptance Criteria

- [x] 设置弹层出现「MCP 配置」「Skill 配置」导航项;两页签均按 全局/本地 分组渲染,本地组可用工作区下拉切换
- [x] 本地组新增一个 stdio server 后,`<工作区>/.byf/mcp.json` 被原子写入且 schema 合法;新建会话后 `listMcpServers` 可见该 server
- [x] 全局与本地存在同名 server 时,全局条目显示「被本地覆盖」标记
- [x] enabled 开关切换后立即落盘(重新拉取列表可见新状态)
- [x] env/headers 值在列表、RAW、结构化响应中始终以占位符回显;带占位符保存(含 enabled 一键切换)后磁盘保留原值,占位符字符串永不落盘;输入新值则覆盖
- [x] 手动写入非法 JSON 到某 scope 的 mcp.json 后,该组进入错误态 + RAW 兜底编辑(显示磁盘原文);修复保存后恢复表单视图
- [x] Skill 页签:新建 skill 写入所选 scope 的 `.byf/skills` 并出现在列表;删除有二次确认;builtin/extra 来源无删除入口;跨 scope 同名显示遮蔽提示
- [x] agent-core 单测覆盖:mcp.json 按 scope 读写(空文件/缺失文件/同名冲突/损坏 JSON/原子写)、skill 创建与删除的路径选择与来源限制
- [x] `bun test`、typecheck 全绿;按 gen-changesets 规则生成 changeset

## Definition of Done

- 上述 AC 全部满足;新增测试落在对应模块的现有测试文件
- Lint / typecheck / CI green
- UI 文案为简体中文,与现有设置页风格一致
- 不触碰工作区中已有的未提交改动(`ProvidersSettings.tsx`、`web-providers-nested-models.md`)

## Out of Scope

- MCP 高级字段的表单编辑(enabledTools/disabledTools/超时)——可用 RAW 兜底编辑改
- 设置页内嵌 SKILL.md 编辑器
- 运行中会话的 MCP 热重载 / 一键重连(沿用「新会话生效」语义;`reconnectMcpServer` 不重读 mcp.json)
- TUI 侧对应 UI(core 层新能力天然可复用,UI 后续再说)
- skill 的 enable/disable 持久化(核心层无此概念,如做需先立设计)
- mcp.json 写入的 revision 乐观锁
- 删除 MCP server 时清理 `mcp/oauth/` 下的残留 OAuth token(孤儿 token 无害,后续可加)
- `.agents/skills` 目录的写入(仅发现)

## Technical Approach

分层链路遵循现状:**agent-core 新模块 → RPC 方法 → node-sdk(ByfHarness)→ web-server 端点 → shared DTO → client 组件**。要点:

1. `mcp/config-store.ts`:与 `config-loader.ts` 共用 `resolveMcpJsonPaths`;提供 `readMcpScope(scope)`(返回结构化条目或 `invalid` 错误态)、`upsertMcpServer(scope, name, config)`、`removeMcpServer(scope, name)`、`readMcpRaw`/`writeMcpRaw`;写入前 schema 校验,tmp+rename 原子写(对齐 `config/toml.ts` 模式)。
2. skill 侧在 `skill/` 下新增 store 层函数:`listSkillsForWorkspace(workDir)`(roots 分 user/project 分组返回 + 遮蔽信息)、`createSkill(scope, name, description)`(模板 SKILL.md)、`removeSkill(path)`(校验来源限定)。
3. RPC/SDK/web 端点草案:
   - `GET /api/mcp/servers?workDir=` → `{ user: {servers|invalid}, project: {servers|invalid}, paths }`
   - `PUT /api/mcp/servers/:scope`(body: name + config,scope ∈ user|project,workDir query)— upsert
   - `DELETE /api/mcp/servers/:scope/:name`
   - `GET/PUT /api/mcp/raw/:scope` — RAW 兜底
   - `GET /api/skills/roots?workDir=`、`POST /api/skills`(scope+name+description)、`DELETE /api/skills`(skill 目录路径,服务端校验来源)
4. client:`SettingsDialog` 增加 section 类型与导航项;新建 `components/settings/McpSettingsSection.tsx`、`SkillSettingsSection.tsx`;工作区选择状态提升到 `SettingsDialog` 共享。
5. 损坏兜底交互:scope 组数据含 `invalid` 标志时整组切到 RAW 模式(错误信息 + textarea + 校验按钮 + 保存),保存成功回到表单。

## Research References

(无 `/research` 记录——本 PRD 未引入新库/新协议,mcp.json 双 scope 文件契约为仓库既有事实。)

## Feasible Approaches

**Approach A: 全链路三层补齐(Recommended)**

- How: agent-core 建 per-scope 读写服务 + skill store,经 RPC/SDK 透出,web 新端点 + 页签。
- Pros: 遵守 PRD-0035 确立的「文件单一 owner、界面只经 core→SDK 读写」;TUI/CLI 未来可复用;校验与原子写集中一处。
- Cons: 样板多(RPC + SDK + DTO + 路由),改动面跨三包。

**Approach B: web-server 直接读写文件**

- How: 在 `apps/web/server` 内直接读写 mcp.json / skills 目录,不动 core。
- Pros: 实现最快。
- Cons: 违反分层约束(web-server 只依赖 `@byfriends/sdk`);校验/原子写/遮蔽语义要复制一份,与 TUI 漂移。

**Approach C: 把 mcp.json 并入 config.toml 统一管理**

- How: MCP server 配置进全局 config.toml + 项目 local.toml。
- Cons: 破坏既有 mcp.json 文件契约(CLI/TUI/文档均依赖),迁移成本与收益不成比例。否决。

## Decision (ADR-lite)

**Context**: mcp.json 目前只读、无 per-scope API;skill 无任何管理入口;PRD-0035 确立「所有界面只通过 agent-core → SDK 一条路径读写文件」。
**Decision**: 采用 Approach A。scope 概念完全对齐现有双层文件契约(全局 `~/.byf` / 本地 `.byf`),不发明第三种存储;MCP 表单只覆盖常用字段,高级字段经 RAW 兜底编辑;损坏文件走「invalid 标志 + 页内 RAW 编辑(磁盘原文)+ 校验落盘」;**env/headers 密钥走占位符掩码 round-trip,占位符永不落盘**(grill 决议 2026-08-18,把 ADR-0036/0038 的密钥纪律从 config.toml 扩展到 mcp.json;损坏文件原文无法掩码属已知例外);`~/.agents/skills` 跨工具共享目录维持只读,byf 只写 `.byf/skills`(grill 决议 2026-08-18);mcp.json 写入**不做** revision 乐观锁(单用户本地工具,读-改-写 + 原子写;与 config.toml raw 的乐观锁策略差异已知并接受)。
**Consequences**: 三包各加一层薄样板;极端并发下 mcp.json 可能 last-write-wins(可接受);后续若 TUI 要同能力,直接复用 core 层;若未来要做 mcp.json 多端编辑冲突防护,可在此 store 上补 revision 而不动 UI;掩码 round-trip 增加约一个 JSON 掩码助手 + 表单「留空 = 保留」的交互成本。

## Implementation Plan (small PRs)

- PR1: agent-core——`mcp/config-store.ts`(per-scope 读/写/RAW + 原子写 + `maskMcpSecrets`/`restoreMcpSecrets`)与 skill store(list/create/remove),RPC + SDK 透出,单测进现有测试文件。
- PR2: web——`/api/mcp/*` 端点 + shared DTO + client「MCP 配置」页签(分组列表、新建/编辑/删除、enabled、冲突标记、RAW 兜底、工作区选择)。
- PR3: web——`/api/skills/*` 端点 + client「Skill 配置」页签(分组列表、模板新建、删除确认、遮蔽标记),changeset,文档补充(data-locations.md 无文件变化可不更新)。

## Technical Notes

- 已探查文件:`packages/agent-core/src/mcp/config-loader.ts`、`config/schema.ts`、`skill/scanner.ts`、`rpc/core-api.ts`、`rpc/core-impl.ts`;`packages/node-sdk/src/byf-harness.ts`、`rpc.ts`;`apps/web/server/src/routes.ts`、`session-manager.ts`;`apps/web/client/src/components/layout/SettingsDialog.tsx`。
- MCP `enabled:false` 在连接层的语义是「连都不连(status=disabled)」,开关落盘即对下个会话生效。
- RAW 兜底的错误信息可能含命令/环境变量但不涉及密钥掩码问题(mcp.json 无掩码先例);错误文案直接展示即可。
- `resolveSkillRoots` 的 projectRoot 是「最近含 `.git` 的祖先」——本地 skill 组展示时用工作区根,创建目录也以项目根为准(与 TUI/CLI 行为一致)。
- 工作区当前有未提交改动(`ProvidersSettings.tsx` + `.changeset/web-providers-nested-models.md`),与本 PRD 无关,实现时不触碰、不并入。

## Domain Terms (draft — for /grill to refine)

| Term                          | Working Definition                                                                                                                                     | Status                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 配置作用域(全局/项目)         | 配置归属的文件层:全局 = `~/.byf/*`,项目 = `<项目根>/.byf/*`;Web UI 文案「全局 / 本地」,本地 scope 需绑定一个已注册工作区;MCP 与 skill 的项目根取法不同 | ✅ 已入 CONTEXT.md(grill 2026-08-18)                                      |
| 遮蔽/覆盖(shadow/override)    | 同名条目在两层文件中并存时的冲突语义:MCP 为 merge override,skill 为发现顺序 first-wins shadow;两份原始定义都保留                                       | ✅ 已入 CONTEXT.md(修正了初稿「skill 即目录」「本地=项目根」的不精确表述) |
| RAW 兜底编辑                  | scope 文件解析失败时,该组降级为原始文本编辑 + 校验通过才落盘的交互模式(源自 ADR-0038 config raw);mcp.json 变体含密钥掩码与损坏文件原文例外             | ✅ 定稿(ADR-0039)                                                         |
| skill root                    | skill 发现的扫描目录,来源为 user/project/builtin/extra 四类(scanner 既有概念)                                                                          | existing,维持                                                             |
| 常用字段(MCP 表单)            | name、transport、command/args/env、url/headers、enabled;其余 schema 字段统称高级字段,走 RAW 编辑                                                       | ✅ 定稿                                                                   |
| 密钥掩码 round-trip(mcp.json) | env/headers 值以占位符回显、保存占位符=保留原值、占位符永不落盘                                                                                        | ✅ 定稿(ADR-0039)                                                         |

## Traceability

- **Created by**: `/think` (2026-08-18)
- **Grilled by**: `/grill` (2026-08-18) — 代码自答修正 6 项(单文件 skill 形态、本地目录不对称、路径校验先例、RPC 进程内形态、表单合并语义、无会话回退),用户裁决 3 项(密钥掩码 round-trip、`.agents/skills` 只读、ADR 升格)
- **Sliced by**: `/story` (2026-08-18) → Child Issues below
- **Sliced into**:
  - #312 — [PRD-0036] MCP 配置读取链路 — per-scope 列表 + 冲突标记 + 损坏错误态 — Done
  - #313 — [PRD-0036] MCP 配置写路径 — 表单增删改 + enabled 落盘 + RAW 兜底 — Done
  - #314 — [PRD-0036] Skill 配置列表链路 — 工作区级枚举 + 遮蔽标记 — Done
  - #315 — [PRD-0036] Skill 新建与删除 — 模板创建 + 路径校验 + 二次确认 — Done
- **New terms**: 配置作用域(全局/项目)、遮蔽/覆盖(shadow/override)→ 已入 CONTEXT.md
- **New decisions**: ADR-0039(mcp.json 密钥掩码 round-trip)→ docs/adr/0039-mcp-json-secret-masking.md

## Issue

#311(父 Issue)
