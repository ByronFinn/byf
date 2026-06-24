# [DONE] PRD-0013: update-config builtin skill

**Status**: Done
**Created**: 2026-06-20
**Revised**: 2026-06-21 (command → skill 方向重设计,经 think + grill 收敛)
**Author**: BYF
**Related**: ADR-0019 (update-config 改为 skill), ADR-0008 (删 plan mode,同等量级 breaking 先例), ADR-0005 (thinking effort, decision 7 迁移语义来源), PRD-0010 (user-configurable providers)

> **重大方向变更(2026-06-21)**:本 PRD 原方案是 `byf update-config` CLI command + `/uc` slash command + 确定性 analyzer/fixer。经重新评估(think + grill),**整套 command 被推翻,改为一个 builtin skill**。核心论据:配置治理的真正缺口在"语义理解"(跨字段矛盾、配置精简、意图校验),这是硬编码规则穷举不完的;而 command 已能做的"确定性废弃字段清理"可以由 LLM 读规则文档完成。参照 mcp-config skill 既有模式(引用源文件作真相源 + 权限弹窗作安全门)。放弃的契约(幂等性/JSON 输出/备份回滚/纯函数单测)经评估为可接受代价。详见 ADR-0019。

## Problem

byf 的用户配置文件 `~/.byf/config.toml` **没有 version 字段,也没有任何 config-level migration runner**。随着 byf 发版,config schema 会新增字段、改名、收敛枚举值,但旧用户的 `config.toml` 不会自动跟进,导致:

1. **废弃字段永久残留**:被 zod strip 的废弃字段(`byf_search`/`byf_fetch`)落入 `config.raw` 后,read→write 往返永远清不掉。
2. **历史字段迁移缺失**:`default_thinking` 要迁移成 `[thinking]` 块,目前只有运行时 `log.warn`,文件不动。
3. **语义矛盾无人检测**:`provider` 同时配 `apiKey` 和 `oauth`、`thinking.mode="off"` 但配了 `effort`、dangling 引用 —— 这些是硬编码规则穷举不完的,需要理解配置意图。

## Goal

提供一个 builtin skill `update-config`,让 LLM 读取用户的 `config.toml`,对照配置治理规则文档 + `schema.ts` 真相源,发现废弃字段/迁移需求/语义矛盾,并直接修改文件(权限弹窗作安全门)。规则知识以自然语言形式存在于 skill body + 配套规则文档,随 byf 发版演进。

## User Stories

1. 作为 byf 用户,我想跑 `/skill:update-config` 让 agent 检查我的 `config.toml` 有没有过期/矛盾配置,并给出优化建议。
2. 作为 byf 用户,我想让 agent 直接帮我清理废弃字段、迁移 `default_thinking`,而不用手动编辑 TOML。
3. 作为 byf 用户,当我的 provider 配了 `apiKey` 又配了 `oauth` 这种语义矛盾时,我想被 agent 指出来并建议修复。
4. 作为 byf 用户,我想测试非默认路径的 config(`/skill:update-config /path/to/test.toml`)。

## Not Building (Out of Scope)

- **幂等性保证**:LLM 驱动不保证两次相同输入相同输出。原 command 的"两次 `--fix` 第二次 0 changes"契约放弃。
- **JSON / CI 集成**:原 command 的 `--output-format json` 放弃。config 治理回归交互式场景,不做 CI pipeline 集成(原 PRD user story 6 失效)。
- **backup / rollback**:对齐 mcp-config skill 既有模式,靠 Write/Edit 权限弹窗作安全门,不实现自动备份/回滚。
- **`mcp.json` / `tui.toml` 的治理**:MVP 只管 `config.toml`。
- **`/uc` alias**:skill 系统不支持自定义 alias。原 `/uc` 放弃,用户改用 `/skill:update-config`。
- **模型自动触发**:skill 设 `disableModelInvocation: true`,只用户手动触发(对齐 mcp-config)。

## What I Already Know (ground truth from code)

### skill 系统机制

- **builtin skill 注册**:`packages/agent-core/src/skill/builtin/index.ts` 的 `registerBuiltinSkills()`,目前只注册 mcp-config。新增 skill 参照 `mcp-config.ts`(`SkillDefinition` + `parseSkillText` + `disableModelInvocation: true`)。
- **skill body 注入**:激活时 body 注入 context **2 次**(turn prompt + system reminder,`agent/skill/index.ts:36-53`)。body 大小直接影响 context 预算 → Context Minimization 是一等关注点(CONTEXT.md L90-91)。
- **skill 不是代码**:它是注入 LLM context 的 markdown 指令,LLM 用既有工具(Read/Write/Edit/Bash)执行。
- **触发路径**:`/skill:<name>`(resolve.ts:92-97)。skill 不支持自定义 alias。

### mcp-config skill 既有模式(直接复用)

- **引用源文件作真相源**:`mcp-config.md:62-63` 指引 LLM "the source of truth is `McpServerStdioConfigSchema`...in `schema.ts`"。不抄录 schema。
- **坏文件不覆盖**:`mcp-config.md:78-80` "If JSON parsing fails, surface the error verbatim and stop"。
- **展示后写**:`mcp-config.md:80-85` 展示当前内容 + 计划写入,权限弹窗是真正的安全门。
- **测试先例**:`skill-session.test.ts:82-96, 389-434` 测 builtin skill 的注册/触发/注入/body 关键词。

### 治理知识来源(从 analyzer/fixer 迁移到规则文档)

原 `update-rules.ts`/`update.ts` 的知识,迁移到 `update-config-rules.md`:

- **废弃字段白名单**:`default_yolo`/`defaultYolo`(removed)、`services.byf_search`/`services.byf_fetch`(removed)、`loop_control.max_steps_per_run`(renamed → `max_steps_per_turn`)。
- **default_thinking 迁移语义**(对齐 ADR-0005 decision 7,以代码优先级为准):`true` → `[thinking] mode="on" effort="high"`;`false` → `mode="off"`;若已有 `[thinking]` 块的 mode/effort,则 default_thinking 本就不生效,只删原字段。
- **raw passthrough 盲点**:zod strip 的字段落入 `config.raw` 后 read→write 清不掉。
- **capabilities 合法值**:规则文档指引 LLM 读 `runtime-provider.ts` 的 `VALID_CAPABILITIES`/`CAPABILITY_DEFINITIONS`(单一真相源,不硬编码)。

### 删除影响(blast radius,已验证)

- **公开 API 删除**(breaking):`@byfriends/sdk` 和 `@byfriends/agent-core` 移除 `Finding`/`UpdateConfigInput`/`UpdateConfigResult`/`analyzeConfig`/`applyFixes`/`DEPRECATED_FIELD_RULES` 导出 → major bump(用户已授权)。
- **wire records 无残留**:command 路线从不经过 agent/wire 系统(host 同步代码),删除无 replay 兼容问题(比 ADR-0008 删 plan mode 更干净)。
- **config 单文件**:`resolveConfigPath`(path.ts:9-14)只认 `$BYF_HOME/config.toml`,无项目级 config.toml 机制。skill 只处理单文件。
- **Finding 类型无外部消费者**:grep 确认 `Finding` 只在 update-config 子系统内使用,删除干净。

## Requirements

1. **新增 builtin skill**:
   - `packages/agent-core/src/skill/builtin/update-config.md`(skill body,~100 行):流程 + 高层检查分类 + **内嵌**治理规则(废弃字段表、迁移语义、raw 盲点说明、capabilities 引用)+ 指向 schema.ts/runtime-provider.ts 真相源。
   - `packages/agent-core/src/skill/builtin/update-config.ts`:`SkillDefinition` 包装器,`disableModelInvocation: true`。
   - 改 `index.ts` 注册 `UPDATE_CONFIG_SKILL`。
   - > **实现决策(偏离 grill G3/G4)**:grill 原计划 body + 独立 `update-config-rules.md` 两文件(冷热知识分离)。实现时发现 builtin skill 的 `dir` 是 pseudo-path(`builtin://update-config`),`${BYF_SKILL_DIR}` 展开后 LLM 无法用 Read 读取 sibling 文件,独立规则文档无法被加载。因此规则内嵌进 body(单文件)。body 体量(~100 行,与 mcp-config 96 行相当)可接受,未违反 Context Minimization 的实质目标。
2. **彻底删除 command 全套**(详见 Implementation Plan)。
3. **skill body 关键指示**:
   - 读 `~/.byf/config.toml`(或 `$ARGUMENTS` 传路径 / `$BYF_HOME/config.toml`)。
   - 解析失败原样报错停止(对齐 mcp-config 坏文件不覆盖)。
   - 字段合法性对照 `packages/agent-core/src/config/schema.ts` 的 `ByfConfigSchema`。
   - 治理规则(废弃字段表/迁移语义/raw 盲点)内嵌在 body 中,不依赖外部文件(builtin skill 的 `${BYF_SKILL_DIR}` 是 pseudo-path,sibling 文件无法被 LLM 读取)。
   - **密钥安全轻提示**:config.toml 含 api_key 明文,agent 不得在输出中复述 api_key/oauth.key 明文,只说"有/无凭证"。
   - 修改前展示"当前值 → 计划值"(对齐 mcp-config),权限弹窗是安全门。
4. **major changeset**:覆盖 `@byfriends/agent-core`、`@byfriends/sdk`、`apps/cli`。

## Acceptance Criteria

- [ ] `/skill:update-config` 在 TUI 能触发,激活后 body 注入 turn prompt。
- [ ] skill 在 `listSkills` 中显示 name='update-config'、source='builtin'、disableModelInvocation=true。
- [ ] skill 对模型不可见、不可调(对齐 mcp-config 测试模式,skill-session.test.ts:403-405)。
- [ ] skill body 包含关键指示:不泄露 api_key、引用 schema.ts 路径、内嵌治理规则(废弃字段表/迁移语义)。
- [ ] `byf update-config` CLI 命令不再存在(options.test.ts 已删该项)。
- [ ] `Finding`/`analyzeConfig`/`applyFixes`/`DEPRECATED_FIELD_RULES`/`UpdateConfigInput`/`UpdateConfigResult` 不再从任何包导出。
- [ ] 所有现有测试通过(删除的测试除外)。
- [ ] 手动验收:含废弃字段的 config.toml,skill 能识别并建议清理;含 `apiKey`+`oauth` 矛盾的 config,skill 能指出。

## Technical Approach

### 新增(参照 mcp-config 模式)

- `update-config.md` body 结构:触发分流 → 读取(含 $ARGUMENTS 路径) → 对照 schema.ts + 规则文档 → 三层检查(废弃/迁移、raw 盲点、语义矛盾) → 展示后写 → 密钥安全提示。
- `update-config-rules.md`:废弃字段表、default_thinking 迁移语义、raw 盲点说明、capabilities 引用 runtime-provider.ts。
- `update-config.ts` + `index.ts` 注册。

### 删除(blast radius 已验证)

**整文件删除**:

- `packages/agent-core/src/config/update-rules.ts`
- `packages/agent-core/src/config/update.ts`
- `apps/cli/src/cli/sub/update-config.ts`
- `packages/node-sdk/test/update-config.test.ts`
- `apps/cli/test/cli/update-config.test.ts`

**部分编辑**:

- `packages/agent-core/src/config/index.ts`(删 update-rules/update re-export)
- `packages/agent-core/src/providers/runtime-provider.ts:240`(改注释,删 update-config 提及)
- `packages/agent-core/test/config/configs.test.ts`(删 import + 5 个 update-config describe 块)
- `packages/node-sdk/src/index.ts`(删 Finding 导出)
- `packages/node-sdk/src/types.ts`(删 Finding import/re-export + UpdateConfigInput/Result 接口)
- `packages/node-sdk/src/byf-harness.ts`(删 updateConfig 方法及相关 import)
- `apps/cli/src/cli/commands.ts`(删 registerUpdateConfigCommand)
- `apps/cli/src/tui/commands/registry.ts`(删 update-config slash command 条目)
- `apps/cli/src/tui/byf-tui.ts`(删 case 分发 + handleUpdateConfigCommand 方法)
- `apps/cli/test/cli/options.test.ts`(删 update-config 期望)
- `apps/cli/test/tui/commands/resolve.test.ts`(删 update-config/uc 断言)

**不动**:`provider-manager.ts:43` 的 `updateConfig`(无关运行时方法)、所有 CHANGELOG(历史记录)、`VALID_CAPABILITIES`(运行时仍用)。

## Domain Terms

- **配置治理规则文档(config governance rules)**:`update-config-rules.md`,以自然语言记录废弃字段/迁移语义/raw 盲点等知识。是 command 路线 `update-rules.ts` 的 skill 化等价物,但以文档形式存在,供 LLM 读取。
- **raw passthrough 盲点**:zod strip 或历史遗留的字段落入 `config.raw` 后,read→write 往返无法清除的现象。

## Open Questions

无。所有 grill 决策(G1-G9 + 发散检查)已解决。

## Traceability

**Think + Grilled by**: 2026-06-21 session

**Resolved items**:

- G1 (密钥安全):接受风险,skill body 轻提示不泄露 api_key 明文。
- G2 (触发模型):`disableModelInvocation: true`,用户专用,对齐 mcp-config。
- G3 (body 体量):原计划 body 精简 + 独立规则文档(冷热知识分离)。**实现时修订**:builtin skill 的 `dir` 是 pseudo-path,sibling 规则文件无法被 LLM Read,故规则内嵌进 body(单文件 ~100 行,与 mcp-config 96 行相当),未实质违反 Context Minimization。
- G4 (规则文档位置):**失效**(被 G3 修订覆盖)。规则不再单独成文,内嵌于 `update-config.md`。
- G5 (迁移策略):直接删无别名期,对齐 ADR-0008。
- G6 (测试边界):可测结构(注册/触发/注入/body 关键词),不可测行为(幂等/输出)。对齐 skill-session.test.ts 先例。
- G7 (ADR):三条件满足(难逆转/反直觉/真实权衡),ADR-0019 已创建。
- G8 (capabilities 真相源):指引 LLM 读 runtime-provider.ts 的 VALID_CAPABILITIES,不硬编码。
- G9 (路径覆盖):skill 参数 `$ARGUMENTS` 传路径,默认 `~/.byf/config.toml`。
- 发散 1 (wire records):command 从不经 wire 系统,删除无 replay 兼容问题。
- 发散 2 (/uc alias):skill 不支持 alias,放弃 /uc,changeset 说明。
- 发散 3 (diff 展示):LLM 文本描述"当前值→计划值",对齐 mcp-config。
- 发散 4 (多 config 文件):config.toml 只单文件,无项目级机制。

**Code cross-checked**: mcp-config.ts/md、skill-session.test.ts、skill/index.ts、resolve.ts、path.ts、byf-harness.ts、schema.ts、runtime-provider.ts、wire records(无 update-config 事件)。

**Implemented by**: builtin skill `update-config`(`packages/agent-core/src/skill/builtin/update-config.{md,ts}`)注册于 `registerBuiltinSkills()`;旧 command 全套(`config/update-rules.ts`、`config/update.ts`、`cli/sub/update-config.ts` 及 SDK `Finding`/`analyzeConfig`/`applyFixes`/`UpdateConfigInput`/`UpdateConfigResult` 导出)已删除;`major` changeset 覆盖 `@byfriends/agent-core`、`@byfriends/sdk`、`apps/cli`。所有 Acceptance Criteria 已满足(代码核验 2026-06-22)。

- **Arch reviewed by**: `/improve-architecture` (2026-06-22) — L3 PRD 状态滞后(标题原为 [GRILLED] 但功能已完成),已修正;High/Medium 发现均与本 PRD 无关。
