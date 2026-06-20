# [SLICED] PRD-0013: byf update-config 命令

**Status**: Sliced
**Created**: 2026-06-20
**Author**: BYF
**Related**: PRD-0002 (/login API type selector), PRD-0010 (user-configurable providers), ADR-0005 (thinking effort, decision 7 corrected during grill)

## Problem

byf 的用户配置文件 `~/.byf/config.toml` **没有 version 字段,也没有任何 config-level migration runner**。随着 byf 发版,config schema 会新增字段、改名、收敛枚举值(如 provider `type` 从 `kimi`/`openai-compat` 收敛到 `openai-completions`),但旧用户的 `config.toml` 不会自动跟进。代码里已经散落着 4 处"软迁移"逻辑,但每一处都有盲点,导致废弃字段**在文件里永久残留**,普通的使用流程(read→write 往返)清不掉它们。

具体盲点(来自代码事实):

| 废弃项 | 当前处理 | 盲点 |
|---|---|---|
| `default_yolo` / `defaultYolo` | 写时 `delete`(`toml.ts:272`) | 仅在"恰好触发 write"时清,残留进 `raw` 则永远清不掉 |
| `max_steps_per_run` | 读时改名为 `max_steps_per_turn`(`toml.ts:250`) | 只在内存改名,**文件里的旧 key 永远残留** |
| `byf_search` / `byf_fetch` | zod strip | 被 strip 后落进 `config.raw`,写入时又原样写回 —— **永远清不掉** |
| `default_thinking` | 运行时 `log.warn`(`byf-tui.ts:957`) | 只 warn,文件不动,用户每次启动被噪声打扰 |

> **provider `type` 旧值不在清理范围**(grill G1 决议):`ProviderTypeSchema` 是严格 `z.enum`(`schema.ts:7-13`),旧值(`openai`/`byf`/`kimi`/`openai-compat`)会直接 parse 失败抛 `CONFIG_INVALID`,byf 启动即报错,用户根本跑不到 update-config。ADR-0004 也明确 "No backward compatibility aliases needed"。旧值的治理归文档维护(CONTEXT.md 已记录 `openai-completions` 替代关系),不是 config 清理工具的职责。

**根本原因**:`config.raw` 机制既是保护也是盲点。`parseConfigData`(`toml.ts:88-92`)把**整个顶层 TOML clone** 塞进 `config.raw`,`configToTomlData`(`toml.ts:270`)写时从 `cloneRecord(config.raw)` 起步原样写回。这包含两层:
- **顶层废弃 key**(`default_yolo`、`byf_search`、`byf_fetch` 等)即使被 zod strip,仍残留在 `raw` 里被写回 → 永久轮回。
- **嵌套 table 内的废弃 key**(如 `[loop_control] max_steps_per_run`、`[permission] mode`)作为整个原始 table 保存在 `raw.loop_control`/`raw.permission` 里 —— 这些是"无害残留"(实际生效值由 schema 解析后的 camelCase 字段决定),但仍会让文件读起来混乱。
- **合法的未知字段**(`telemetry`、`theme`、`notifications` 等 schema 不认识的顶层字段)也靠 `raw` 保留 —— 这是 `raw` 机制的保护面,update-config **绝不能误删**。

## Goal

新增 `byf update-config` 子命令,按当前 byf 版本的 config schema 规则,清理/迁移用户 `config.toml` 中的废弃、残留字段,检测 dangling 引用与 unknown/invalid-value 字段。**规则集随 byf 发版演进**(与 `schema.ts` 同居维护),保证"与我装的 byf 版本匹配"。

- 默认 **dry-run**,打印分类清单;`--fix` 才改写文件。
- `--fix` 前自动备份,改写后重新校验 zod parse 通过。
- 输出支持 pretty(默认)与 JSON(`--output-format json`)。

## User Stories

1. 作为 byf 用户,我想跑 `byf update-config` 看看我的 `config.toml` 有没有过期字段,而不实际改动它,这样我能在改之前先了解发生了什么。
2. 作为 byf 用户,我想跑 `byf update-config --fix` 自动清理废弃字段并落盘迁移,这样我不用手动编辑 TOML。
3. 作为 byf 用户,我想在 `--fix` 前自动生成备份,这样万一改坏了我能恢复。
4. 作为 byf 用户,我想看到 `default_thinking=true` 被正确迁移成 `[thinking]` 块,而不是被静默丢弃或只 warn。
5. 作为 byf 用户,我想被告知某个 model 别名指向了不存在的 provider(dangling),但不要自动删它(我可能正要补上那个 provider)。
6. 作为 CI/pipeline 维护者,我想用 `byf update-config --output-format json` 拿到机器可读的报告,集成到配置巡检流程。
7. 作为 byf 维护者,我想在改 config schema 时,顺手在同一个目录(`config/update-rules.ts`)更新迁移规则,而不是分散在多个文件。

## Not Building (Out of Scope)

- **`mcp.json` / `tui.toml` 的清理**:三个文件 schema/废弃逻辑不同,MVP 只管 `config.toml`。CLI 签名预留 `--scope` 参数(默认 `config`),但 MVP 只实现 `config`。
- **TOML 语法修复**:update-config 不是 toml linter。文件语法坏掉 → 拒绝 `--fix`,只提示用户手动修。
- **自动删除 dangling 引用**:只报告,`dry-run` 和 `--fix` 都不自动删(用户可能正在补 provider 配置)。
- **依赖/工具链版本升级**:那是另一个命令的职责,不在 config.toml 优化范畴。
- **TUI 内入口**:✅ 已实现 `/update-config`(alias `/uc`) slash command;MVP 不扩展其它 TUI 入口。

## What I Already Know (ground truth from code)

### config.toml schema 与生命周期
- **Schema 唯一真相源**:`packages/agent-core/src/config/schema.ts`(`ByfConfigSchema` L204-221),用 zod 定义。各包通过 `"zod": "catalog:"` 引用统一版本。
- **无 version 字段**:全仓 grep `configVersion`/`schemaVersion` 0 匹配。现有的 migration 体系全是 wire protocol / session record 级别(`packages/agent-core/src/agent/records/migration/`),与 config 无关。
- **路径解析**:`packages/agent-core/src/config/path.ts` —— `resolveByfHome()` = `BYF_HOME env ?? ~/.byf`;`resolveConfigPath()` = `$BYF_HOME/config.toml`。
- **解析流程**:`readConfigFile`(`toml.ts:63`)→ `parseConfigString` → smol-toml `parse` → `transformTomlData`(snake↔camel,L102)→ `ByfConfigSchema.parse`(L94,zod 校验,失败抛 `ByfError(CONFIG_INVALID)`)。
- **写流程**:`writeConfigFile`(`toml.ts:263`)→ `validateConfig` → `atomicWrite` + `stringifyToml(configToTomlData(...))`。目录权限 `0o700`,文件 `0o600`。
- **核心消费者**:`packages/agent-core/src/rpc/core-impl.ts`(`getByfConfig` L334 读 / `setByfConfig` L339 写 + reload ProviderManager)。

### `config.raw` 的双面性
- 读时所有未识别顶层字段塞进 `config.raw`;`configToTomlData`(`toml.ts:269`)写时把 `raw` 原样写回。
- **保护**:config.toml 能安全携带 schema 不认识的字段(`telemetry`、`theme`、`notifications`)。
- **盲点**:被 zod strip 的废弃字段(`byf_search`/`byf_fetch`)落进 raw 后,read→write 往返永远清不掉。这是 update-config 最核心的切入点。

### provider `type` 历史收敛
- 当前合法枚举(schema.ts):`anthropic` / `openai-completions` / `google-genai` / `openai_responses` / `vertexai`。
- 历史 commits:`rename kimi provider to openai-compat` → `add unified openai-completions provider`,说明经历了 `kimi → openai-compat → openai-completions` 的收敛。
- 文档 `config-files.md:92` 仍过时地列着 `openai` / `byf` / `openai-compat`,用户照抄会得到无效值。
- **推断映射**(实现时需对照 git history 最终确认):`openai` / `byf` / `kimi` / `openai-compat` → `openai-completions`。

### `default_thinking` 运行时迁移
- `byf-tui.ts:957-958`:读到 `config.defaultThinking` 时 `log.warn('defaultThinking is deprecated. Use [thinking] mode and effort instead.')`。
- commit `69a2500`:backward compat preserved,`true → high`,`false → off`。
- `ThinkingConfig`(schema.ts L54-57):`mode: 'auto'|'on'|'off'`,`effort: 'low'|'medium'|'high'|'xhigh'|'max'`。
- **运行时优先级权威来源**(`byf-tui.ts:960-969` 三元表达式):`[thinking]` 块优先于 `default_thinking` —— 只要 `[thinking] mode="off"` 或 `[thinking] effort` 有值,`default_thinking` 就被忽略。**这与 ADR-0005 decision 7 文字描述("defaultThinking takes precedence silently")相反**,以代码为准。
- **迁移语义**(grill G3 决议,严格对齐代码优先级,不引入行为改变):
  1. 若 `[thinking]` 块已有 `mode` 或 `effort` → `default_thinking` 本就不生效 → 只删 `default_thinking`,不动 `[thinking]` 块,Finding 记为 `removed`("already superseded by [thinking]")。
  2. 若 `[thinking]` 块不存在 → 迁移:`default_thinking=true` → 写 `[thinking]` `mode="on"` + `effort="high"`;`=false` → 写 `[thinking]` `mode="off"`;然后删原字段,Finding 记为 `migrated`。

### 现有 CLI 子命令架构(新命令模板)
- 入口:`apps/cli/src/cli/commands.ts` 的 `createProgram()`,Commander.js。
- 唯一现成范例:`apps/cli/src/cli/sub/export.ts`(`registerExportCommand` + 纯函数 `handleExport` + `ExportDeps` 注入 + `createDefaultExportDeps` 工厂)。
- **硬约束**(`apps/cli/AGENTS.md`):apps/cli 不得直接 import `@byfriends/agent-core`,必须走 `@byfriends/sdk` 的 `ByfHarness`。
- 命令能访问 `process.cwd()`、版本(`createByfHostIdentity`)、BYF 主目录(`resolveByfHome`)。

### 重复 provider 的真实行为
- TOML 规范下同名 table 重复定义是**语法错误**(smol-toml 直接抛错)。
- 因此"重复 provider"实际不会发生在能 parse 的文件里。真正可能重复的是:`[models.xxx]` 里两个 alias 指向相同 `provider+model`,或 `default_model` 隐含的 provider 与 `default_provider` 不一致。
- **重新定义**:update-config 的"检测重复"降级为"检测冗余/冲突的 model 别名"。

## Requirements

1. **命令形态**:`byf update-config [options]`,遵循 `export` 子命令架构(`registerUpdateConfigCommand` + 纯函数 `handleUpdateConfig` + `UpdateConfigDeps` 注入 + SDK 访问)。
2. **默认 dry-run**:扫描并打印发现项分类清单,不改动文件。`--fix` 才改写。
3. **安全机制**:
   - `--fix` 前自动备份 `config.toml.bak.<timestamp>`(ISO 时间戳到秒,权限对齐 `0o600`)。**不加上限**(grill G7 决议:配置改动不频繁不会堆积;加上限可能误删用户想保留的旧备份)。备份采用先 copy 再 write 的顺序,确保备份一定是 fix 前的状态。
   - 改写后重新 `readConfigFile` 校验 zod parse 通过;失败则回滚备份并报错退出。
   - 文件不存在 → 打印 "no config.toml found, nothing to update" 正常退出(exit 0)。
   - TOML 语法错误 → 拒绝 `--fix`(避免在坏文件上叠加写),只提示用户手动修(exit 非 0)。
   - **并发限制**(grill 发现):`atomicWrite`(`utils/fs.ts:149`)是 write-tmp-then-rename,并发安全(不写半个文件),但两个进程先后 rename 会互相覆盖。update-config 不引入文件锁(过度设计),仅在文档提示"不要在 TUI 运行时跑 `--fix`"。
4. **清理类别**:
   - **removed**:删三层残留(grill G4 实测证实,全清):
     - 顶层 `default_yolo`/`defaultYolo`(即便 `configToTomlData:273` 有 delete,用户从未触发 write 时仍残留)。
     - `raw.services` 里的 `byf_search`/`byf_fetch`(实测证实:**永久轮回** —— `servicesToToml` 用 `cloneRecord(rawServices)` 起步原样写回,这是 read→write 往返唯一真正清不掉的)。
   - **renamed**:清理 `raw.loop_control` 里的 `max_steps_per_run` 冗余 key(实测:读时改名为 `max_steps_per_turn` 并生效,但旧 key 残留在 `raw.loop_control` 里,write 后新旧 key 并存。属"无害残留",但**必须删才能满足幂等性** —— 否则每次 scan 都报)。
   - **migrated**:`default_thinking` → `[thinking]`(见 G3 迁移语义),然后删原字段。
   - **unknown**(只报告不删,扩展项 C1):用户配了 schema 不认识的子键(拼错、已废弃名、文档教了但 schema 没有的字段)或落入 `raw` 嵌套 table 的不生效字段(如 `[permission] mode`、`[background] max_tasks`)。这类键被 zod strip 静默丢弃,系统不报错但值完全无效。专门的 `ghost` 分类(见下 Implementation Notes)在当前版本中并入 `unknown` 处理。
   - **dangling**(只报告不删):指向不存在 provider 的 `models.<alias>` / `default_provider` / `default_model`。
     - **provider 存在性判定**(grill G6 代码核实):唯一来源是 `config.providers`(`runtime-provider.ts:71-73` `config.providers[providerName]`、`provider-manager.ts:35-37`)。catalog/动态 provider 通过 `/connect` 写入时也写进 `config.providers`(PRD-0010),故**无需额外来源**,不会误报。
     - 检测项:
       1. `models.<alias>.provider` ∉ `Object.keys(config.providers)` → dangling model alias。
       2. `default_provider` ∉ `Object.keys(config.providers)` → dangling default_provider。
       3. `default_model` ∉ `Object.keys(config.models ?? {})` → dangling default_model(注:default_model 指向的是 model 别名,不是 provider)。
   - **invalid-value**(只报告,扩展项 C2):语义上是有限集合、但 schema 写成自由 string 的字段,用户配了不在集合内的值。当前唯一覆盖:`models.<alias>.capabilities`(schema.ts:47 `z.array(z.string())`,合法值仅 9 个)。
     - **合法值来源**(C2 决议):从 `runtime-provider.ts` 导出的已知 capability 集合(当前 `image_in`/`video_in`/`audio_in`/`thinking`/`always_thinking`/`tool_use`/`thinking_effort`/`thinking_xhigh`/`thinking_max`,见 runtime-provider.ts:219-226)。**实现时需新增 export,update-rules.ts import 它 —— 单一真相源,不硬编码重复**,与"规则随版本演进"原则一致。
     - 检测大小写不敏感(runtime-provider 同样 `.toLowerCase()` 匹配)。
     - **只报告不删**:移除用户配的 capability 会改变模型行为,由用户决定。
   - ~~**mapped**:provider `type` 旧值映射~~ —— **grill G1 移除**:旧值 parse 失败,update-config 自身读不了,属文档治理而非清理工具职责。
   - 采用**白名单策略**(grill G2 决议):只有 `update-rules.ts` 明确登记的废弃 key 才删,其它 `raw` 字段(含合法未知字段 `telemetry`/`theme`/`notifications`)一律保留。**注:unknown/invalid-value 检测会报告这些字段的存在,但 `--fix` 不删 —— "报告"与"删除"是两件事,不矛盾。**
   - **TOML 作用域陷阱**(grill G4 实测附带发现):若 `default_yolo` 被写在某个 `[table]` 之后,会被 TOML 解析为该 table 的子键(实测 `default_yolo` 出现在 `raw.services.byf_fetch.default_yolo`)。MVP **不做**误嵌套修复(复杂度高,且属 TOML 写法问题而非字段废弃),仅在文档提醒。
5. **输出**:默认 pretty 分类清单;`--output-format json` 切机器可读。**dry-run 和 --fix 共用同一套 Finding**(grill G8 决议):报告"发现了什么 + 会怎么改",`--fix` 额外追加"已写入 + 备份路径"的尾部摘要。
   - **Finding 数据结构**:`{ kind: 'removed'|'renamed'|'migrated'|'dangling'|'unknown'|'invalid-value', path: string, detail: string, deprecatedSince?: string }`(`mapped`/`ghost` 已移除/延后;`unknown`/`invalid-value` 为 C1/C2 扩展新增)。`path` 用 TOML 路径(如 `services.byf_search`、`loop_control.max_steps_per_run`、`default_thinking`、`models.gpt4.max_context_tokns`、`models.gpt4.capabilities[vision]`)。
   - **敏感字段脱敏**:报告里绝不输出 `api_key` / `oauth.key` 明文,provider 字段默认只展示 `type`/`base_url`/`default_model` 等非密字段。
6. **规则集位置**:`packages/agent-core/src/config/update-rules.ts`,每条规则带 `deprecatedSince` 版本标注,通过 SDK 导出。
7. **幂等性**:跑两次 `--fix`,第二次报告 `0 changes`。
8. **Flag**:`--fix`、`--output-format <pretty|json>`、`--config <path>`(覆盖默认 config 路径)、`--scope <config>`(MVP 仅 `config`,预留扩展)。

## Acceptance Criteria

- [ ] `byf update-config`(无 `--fix`)只打印报告,文件 mtime/内容不变。
- [ ] `byf update-config --fix` 对含 `default_yolo`、`max_steps_per_run`、`byf_search`、`default_thinking=true` 的 fixture,改写后这些项全部消除且迁移正确(对照 G3:`default_thinking=true` → `[thinking]` `mode="on"` + `effort="high"`)。
- [ ] 连续两次 `--fix`,第二次输出 `0 changes`(幂等)。
- [ ] `--fix` 生成了带时间戳的 `.bak` 备份;改写后文件能被 `readConfigFile` 重新加载且 ProviderManager 不报错。
- [ ] 文件不存在时正常退出(exit 0);TOML 语法错误时拒绝 `--fix`(exit 非 0)且不生成备份。
- [ ] dry-run 报告中不含任何 `api_key`/`oauth.key` 明文。
- [ ] `--output-format json` 输出合法 JSON,pretty 输出对人友好。
- [ ] dangling 引用在 dry-run 和 `--fix` 下都只报告、不删除。
- [ ] unknown 字段(如 `models.x.max_context_tokns` 拼错、顶层 `telemetry`)在 dry-run 和 `--fix` 下都只报告、不删除;文案提示"值已被忽略,可能是拼写错误/未识别字段"。
- [ ] invalid-value:`models.x.capabilities = ["vision"]` 被报告为不在合法集合(集合从 `runtime-provider` 导出);`--fix` 不改。
- [ ] 检测 unknown 用的字段集合来自 zod `.shape`(非硬编码);检测 capabilities 用的合法值从 `runtime-provider` 导出(非硬编码)—— 验证两处单一真相源不漂移。
- [ ] 现有 `packages/agent-core/test/config/configs.test.ts` 全绿;新增 update 规则测试加到该文件(不新建测试文件)。

## Technical Approach

### agent-core 层(核心)
- **`config/update-rules.ts`**:规则数据结构 + 规则表。
  - `Finding`:`{ kind: 'removed'|'renamed'|'migrated'|'dangling'|'unknown'|'invalid-value', path: string, detail: string, deprecatedSince?: string }`(`mapped`/`ghost` 已移除/延后;`unknown`/`invalid-value` 为 C1/C2 扩展)。
  - 规则表:废弃字段白名单(`default_yolo`/`byf_search`/`byf_fetch`/`max_steps_per_run`)、`default_thinking` 迁移函数(对齐 G3)。
  - **unknown 检测用的已知字段集合**:从各 schema 的 zod `.shape` 动态取,不硬编码。
  - **invalid-value 用的 capability 合法值**:从 `runtime-provider.ts` 新增导出的集合 import,不硬编码。
- **`config/update.ts`**:
  - `analyzeConfig(config): Finding[]` —— 纯函数,扫描 config(含 `raw` 及嵌套 `raw.services`/`raw.loop_control`/`raw.providers.*`/`raw.models.*` 等)产出发现项。
  - `applyFixes(config, findings): ByfConfig` —— 纯函数,对可安全自动修的发现项(removed/renamed/migrated)应用变更;dangling/unknown/invalid-value 跳过。
  - 复用现有 `toml.ts` 的 read/write/`configToTomlData`,在 `configToTomlData` 前插入显式 raw 清理(含嵌套 table 内的残留 key)。

### node-sdk 层
- **`byf-harness.ts`**:暴露 `updateConfig({ fix, outputFormat, configPath })` 方法,返回报告(Finding[] 或 JSON 字符串)或执行改写(备份 + 校验 + 回滚)。内部调用 agent-core 的 `analyzeConfig`/`applyFixes`。

### apps/cli 层
- **`src/cli/sub/update-config.ts`**:`registerUpdateConfigCommand(parent, deps?)` + `handleUpdateConfig` + `UpdateConfigDeps` + `createDefaultUpdateConfigDeps`。
- **`src/cli/commands.ts`**:import 并 `registerUpdateConfigCommand(program)`。
- Flag 解析为纯参数传给 SDK;输出格式化 + 备份/校验在 CLI 层完成(SDK 提供原语)。

## Implementation Plan (小 PR 切分)

1. **PR1 — agent-core 规则集 + analyzer/fixer**:`update-rules.ts` + `update.ts` + 测试(加到 `configs.test.ts`)。核心,可独立验证,不依赖 CLI/SDK 改动。
2. **PR2 — node-sdk harness 暴露 `updateConfig`**:`byf-harness.ts` 方法 + 测试。依赖 PR1。
3. **PR3 — apps/cli 子命令**:`update-config.ts` + `commands.ts` 注册 + dry-run/JSON 输出 + 备份/校验/回滚 + 集成测试。依赖 PR2。

## Domain Terms

- **Finding(发现项)**:update-config 报告的原子单元,带 `kind`/`path`/`detail`/`deprecatedSince`。
- **废弃字段(deprecated field)**:schema 曾接受但已不推荐/将移除的字段(如 `default_yolo`、`default_thinking`)。
- **Ghost 字段**(deferred):落入 `config.raw` 的不生效字段(如 `[permission] mode`),用户以为生效实则被忽略。当前版本中这类字段由 `unknown` 类别报告,未来可能拆分为独立的 `ghost` 类别并支持自动清理。
- **Dangling reference**:指向不存在 provider 的 `models.<alias>` / `default_provider` / `default_model` 引用。
- **Raw passthrough 盲点**:zod strip 或历史遗留的字段(尤其 `raw.services.byf_search` 等嵌套残留)落入 `config.raw` 后,read→write 往返无法清除的现象 —— update-config 的核心价值所在。

## Traceability

**Grilled by**: grill session 2026-06-20

**Resolved items**:
- G1 (provider type 映射):从 MVP 移除 —— 旧 type 值 parse 失败,update-config 自身读不了,属文档治理。
- G2 (raw 清理粒度):白名单策略,只删 `update-rules.ts` 登记的废弃 key。
- G3 (default_thinking 迁移):严格对齐代码优先级(`[thinking]` > `default_thinking`),发现并修正 ADR-0005 decision 7 文字错误。
- G4 (残留严重性):实测证实三层残留,全清;附带发现 TOML 作用域陷阱(MVP 不修)。
- G5 (幂等性):由 G4 全清决策覆盖。
- G6 (dangling 判定):provider 存在性唯一来源是 `config.providers`,不会误报。
- G7 (备份):时间戳命名,不加上限。
- G8 (输出):dry-run 与 --fix 共用 Finding。
- C1 (unknown 处置):只报告不删,与 dangling 一致 —— 未知键可能是自定义/未来字段,自动删风险高。
- C2 (capabilities 值源):从 runtime-provider 导出合法值集合,update-rules.ts import,单一真相源不硬编码。

**Code cross-checked**: schema.ts、toml.ts、byf-tui.ts:957-969、runtime-provider.ts:71-73、provider-manager.ts、utils/fs.ts:149、configs.test.ts:352-366。

**Files updated during grill**:
- `docs/prd/PRD-0013-update-config-command.md` — Status → Grilled,multiple sections corrected against code facts.
- `docs/adr/0005-thinking-effort-validation-and-clamping.md` — decision 7 wording corrected ([thinking] takes precedence, not defaultThinking).

**Exhaustiveness gate**: passed (Open Questions / Assumptions / Terms / Scope / Code all checked).

**Sliced by**: story session 2026-06-20

**Sliced into** (child issues, dependency order):
- #175 [PRD-0013] 骨架 + removed/renamed 清理 — 命令端到端跑通,清三层残留 (AFK) — 地基,无依赖
- #176 [PRD-0013] default_thinking → [thinking] 迁移 — 按代码优先级,不改变运行时行为 (AFK, blocked by #175)
- #177 [PRD-0013] dangling 引用检测 — 报告指向不存在 provider/model 的悬空引用 (AFK, blocked by #175)
- #178 [PRD-0013] unknown 字段检测 — 未知子键 + capabilities 值校验(只报告) (AFK, blocked by #175)
- #179 [PRD-0013] 安全机制 + 输出完善 — 备份/校验/回滚 + pretty/JSON 输出 + 脱敏 (HITL, blocked by #175-#178)

> 切片策略:#175 是地基(建立 Finding 体系 + 命令管道 + 基础清理);#176/#177/#178 彼此独立(各新增一种 Finding kind),可并行;#179 是横切收尾(安全 + 输出覆盖所有 finding 类型),依赖前四个就绪。

## Implementation Notes

- **`ghost` 分类延后**:PRD 早期草稿在 `Finding.kind` 中预留了 `ghost`,用于标识落入 `config.raw` 嵌套 table 的不生效字段(如 `[permission] mode`)。实现时发现这些字段与不认识的 schema 字段共享同一检测路径,且数量/边界模糊,因此当前版本统一以 `unknown` 报告、`--fix` 不删除,保持实现简单。`ghost` 的独立分类与自动清理能力可作为后续增强项。
- **TUI slash command 已加入**:虽然早期 "Not Building" 列出 "不在 TUI 里加 slash command",但实现时补充了 `/update-config`(alias `/uc`) slash command,便于在 TUI 内直接触发配置巡检。该命令与 CLI 子命令共用同一 SDK 方法,输出以 notice 形式展示。
- **Permission 简写兼容**:TOML 仍支持 `[permission]` 下的 `deny`/`allow`/`ask` 数组简写,这些简写会被 `transformPermissionData` 折叠为 `rules`。`update-config` 的 unknown 检测必须识别这些键,避免误报。

## Open Questions

无。所有 grill 决策已落入上文相应章节。
