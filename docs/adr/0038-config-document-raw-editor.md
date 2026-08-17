# 0038 - ConfigDocument：config.toml 全量编辑为 canonical，revision 乐观锁与密钥无损掩码

Date: 2026-08-17

## Status

Accepted

## Context

PRD-0034 为 web 提供了结构化配置表单（provider/model CRUD），但用户需要**直接编辑 `config.toml` 全文**（长尾字段、注释、实验配置），现有 `writeConfigFile` 走 `parse → validate → configToTomlData → stringify`，必然重排并丢失注释/空行（PRD-0035 T4 已验证），且无法表达「原样写回」。同时存在并发覆盖风险：TUI/headless 与 web 都可写同一文件，没有冲突检测。另外 ADR 0036 D3 确立了 apiKey「只写不读、任何 GET 恒脱敏」的结构性单向契约，而 raw 编辑器必须显示文件全文——两者直接冲突。

## Decision

- **D1 raw 为 canonical writer**：`config.toml` 存在两条写路径——**raw 全保真写**（`writeConfigText`：读取磁盘文本 → 校验 expectedRevision → `parseConfigString` 校验 → 原样原子写回，注释/空行/未识别键全保真）与**结构化语义写**（现有 `setConfig`：merge + stringify，不承诺保留注释，UI 明示「可能规范化文件」）。结构化表单与 raw 编辑器是同一文件的两个视图，不是数据库 + 文件。
- **D2 revision 乐观锁**：`revision = sha256(磁盘原文)`；文件缺失为 `null`。raw PUT 与结构化 `setConfig` 都接受 optional `expectedRevision`，不匹配返回 `409 CONFIG_REVISION_CONFLICT`，**不提供 force 覆盖**；`expectedRevision: null` 视为创建。所有配置写成功后返回新 revision。
- **D3 服务端校验**：raw 写前与显式 validate 都走 `parseConfigString`（TOML 语法 + schema），invalid 返回 `422 CONFIG_INVALID`（含 path/line/column 诊断），不落盘。
- **D4 密钥无损掩码（扩展 ADR 0036 D3，不改其单向契约）**：`GET /api/config/raw` 响应中 `api_key`/`apiKey` 的**值**替换为占位符，**永不回显明文，不提供显示密钥开关**；保存时：占位符行原样保留 = 保留磁盘原值，占位符行删除 = 删除该 key，写入新值 = 更新（新值才过线）。`revision` 在磁盘原文上计算，与掩码文本无关。错误响应与日志不得包含密钥全文。
- **D5 文件缺失语义**：`GET /api/config/raw` 在 config.toml 不存在时返回 200 + 默认配置解析 + `revision:null`（UI 提示「文件不存在，保存将新建」），使「从零配置」场景不断裂。

## Consequences

### Positive

- 所有 schema 字段（含长尾）都可直接编辑，不再受表单覆盖范围限制。
- 注释/空行/未识别键在 raw 路径零丢失；「文件是真相」原则下 Web/TUI/headless 对同一文件的认知一致。
- revision 乐观锁让双进程并发写变得安全（检测而非静默覆盖）。
- 密钥明文永不跨线，ADR 0036 的威胁模型（token 泄漏即全权，但不含密钥窃取）不变。

### Negative

- 结构化保存仍会规范化文件——本 ADR 只做到「提示 + 同源」，未根治 comment-preserving TOML patch（v1.1 再评估 CST/文本级 patch）。
- 掩码占位符与「真·全保真」存在语义例外（密钥字段原文只在服务端与磁盘间流动），用户可能困惑「为什么密钥显示为占位符」——需要 UI 文案解释。
- revision 校验增加写路径复杂度；`setConfig` 现有调用方（web 表单、CLI login）需适配 optional expectedRevision 参数。

## Alternatives Considered

- **只做结构化全量表单**：无法覆盖长尾字段，且用户明确要求编辑文件。否决。
- **前端直写文件**：违反唯一 owner 与安全原则（浏览器进程无文件权限模型）。否决。
- **提供「显示密钥」开关回显明文**：允许在 raw 查看明文密钥。否决——打破 ADR 0036 结构性单向契约，token 泄漏将从「可改配置」升级为「可窃取复用密钥」；且编辑场景下密钥只需知道已配置/未配置。
- **comment-preserving 结构化 patch（v1.1）**：保留注释的结构化写，成本高（CST/文本级 diff），本版本不实现，标注为未来扩展点。

## References

- PRD-0035（`docs/prd/PRD-0035-web-vis-merge.md`，R-A3/A4/A5、R-B2、R-E1~R-E8）
- ADR 0036（apiKey 只写不读模型，本 ADR 的 D4 是其扩展）
- `packages/agent-core/src/config/toml.ts`（`writeConfigFile` 现状，PRD-0035 T4）