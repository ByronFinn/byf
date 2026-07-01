# ADR 0019: 将 update-config 命令替换为内置技能

## 状态

已接受

## 背景

`byf update-config` 以 CLI 子命令 + `/update-config`（`/uc`）斜杠命令的形式发布。它通过确定性分析器/修复器（`packages/agent-core/src/config/update-rules.ts` 和 `update.ts`）审计 `~/.byf/config.toml`，通过 SDK 中的 `ByfHarness.updateConfig()` 和 CLI 中的 Commander 子命令暴露。它保证了幂等性（`--fix` 两次 → 第二次 0 变更）、面向 CI 的机器可读 JSON 输出、带时间戳的备份与回滚，以及可单元测试的纯函数。

在重设计审查期间，我们评估了确定性方法是否适合真正的配置治理缺口：

- **命令能做**的范围受限于硬编码规则：一个废弃字段白名单（`default_yolo`、`byf_search`、`max_steps_per_run`……）、一个 `default_thinking` → `[thinking]` 迁移、悬挂引用检测和一个单一能力枚举检查。添加任何检查都意味着编辑 `update-rules.ts`。
- **它不能做**的部分正是真正需要理解意图的部分：一个同时配置了 `api_key` 和 `oauth` 的 provider；`thinking.mode = "off"` 但仍设置了 `effort`；与模型实际限制矛盾的 `maxContextSize`；冗余或过时的 provider；跨字段语义冲突。这些是开放式的，无法在规则表中穷举。

一个内置技能（`mcp-config`）已经存在于仓库中，并示范了替代模式：其正文是注入 LLM 上下文的 markdown，它将代理指向源文件作为真相源（`schema.ts`），并依赖 Write/Edit 权限提示作为安全门而非备份/回滚。那个先例使基于技能的配置治理流程在这里成为自然的选择。

权衡是具体的：一个技能放弃了幂等性、确定性输出、JSON-for-CI 和备份/回滚，以换取语义理解和对话式优化。我们判断确定性保证在实践中价值不大——没有 CI 管线消费 `--output-format json`，备份/回滚是用户很少破坏的文件上的深度防御，而幂等性契约主要是为了满足规则引擎自身的 raw-passthrough 怪癖。

## 决策

删除整个 `byf update-config` 命令子系统，替换为单一内置技能 `update-config`：

- **新的内置技能**位于 `packages/agent-core/src/skill/builtin/`（`update-config.md` 正文 + `update-config.ts` 包装器），通过 `registerBuiltinSkills` 注册，`disableModelInvocation: true`（仅用户，类似 `mcp-config`）。通过 `/skill:update-config` 调用。
- **治理知识内联到技能正文中。** 废弃字段表、`default_thinking` 迁移语义、raw-passthrough 盲点解释和能力参考都存在于 `update-config.md` 内部。早期计划要求单独的 `update-config-rules.md` 兄弟文件（冷/热知识分离），但内置技能的 `dir` 是伪路径 `builtin://update-config`，因此 `${BYF_SKILL_DIR}` 无法解析到 LLM 可以 `Read` 的真实磁盘位置——兄弟规则文件无法加载。内联使正文保持在约 100 行（与 `mcp-config` 的 96 行相当），并避免了伪路径问题。
- **治理知识**（废弃字段表、`default_thinking` 迁移语义、raw-passthrough 盲点解释）从 `update-rules.ts` 移到 `update-config-rules.md` 中，作为自然语言。字段级有效性不重复：技能正文将代理指向 `schema.ts`（`ByfConfigSchema`）和 `runtime-provider.ts`（`VALID_CAPABILITIES`）作为唯一事实来源。
- **删除** `update-rules.ts`、`update.ts`、CLI 子命令、`/update-config`（`/uc`）斜杠命令、SDK `ByfHarness.updateConfig()` 方法以及公开类型 `Finding` / `UpdateConfigInput` / `UpdateConfigResult`。这是 `@byfriends/agent-core` 和 `@byfriends/sdk` 的 **major** 破坏性变更。
- **密钥处理**：config.toml 以明文存储 `api_key`。技能正文携带轻量指令，不要在其输出中回显 `api_key`/`oauth.key` 值（仅陈述存在/不存在）。我们接受密钥在代理读取文件时进入对话历史的残余风险；这与 config.toml 是明文本地文件的现有设计一致。
- **路径覆盖**通过 `$ARGUMENTS` 技能参数（默认 `~/.byf/config.toml`）。

## 结果

- **正面**：配置治理获得语义理解——硬编码规则永远无法穷举的跨字段冲突、冗余条目和意图级检查。规则集会通过编辑 markdown 文档而非 TypeScript 来演进。
- **正面**：移除了确定性分析器/修复器、SDK 方法、两个测试文件、CLI 子命令和 TUI 斜杠命令——表面区域的有意义减少，与 ADR-0008 的理由一致。
- **正面**：无 wire-record 兼容性问题——命令路径从未触及代理/wire 系统，因此删除比 ADR-0008 的 plan-mode 移除更干净。
- **负面**：破坏性变更。`byf update-config` 和 `/uc` 消失，无语号别名期（与 ADR-0008 对齐）。针对该命令编写脚本的用户必须切换到 `/skill:update-config`。需要主要版本升级。
- **负面**：幂等性、JSON 输出、备份/回滚和纯函数单元测试丢失。技能的行为通过结构验证（注册、激活、正文注入）验证，遵循 `mcp-config` 测试先例，而非通过确定性断言来验证输出。
- **负面**：`api_key` 明文可能在代理读取 config.toml 时进入对话历史；仅通过提示级指令缓解，而非强制。
