# 0039 - mcp.json 的 Web 管理边界:per-scope 读写与 env/headers 密钥掩码

Date: 2026-08-18

## Status

Accepted

## Context

PRD-0036 为 Web 设置页新增 MCP 配置页签:按 全局(`~/.byf/mcp.json`)与 项目(`<工作区>/.byf/mcp.json`)两个 scope 做 server 的增删改、enabled 开关与 RAW 兜底编辑。`mcp.json` 的 `env` 与 `headers` 字段常承载 API key 等密钥(如 `GITHUB_TOKEN`、`Authorization`)。

ADR 0036 已为 config.toml 的 apiKey 确立「只写不读、任何 GET 恒脱敏」的单向契约;ADR 0038 D4 把该契约扩展为 raw 编辑的「密钥无损掩码 round-trip」。mcp.json 是第二个含密钥的配置文件——若无明确规则,MCP 设置页要么明文回显 env/headers(拿到 web token 或本机浏览器访问即可窃取密钥,打破既有威胁模型「token 泄漏即全权,但不含密钥窃取」),要么彻底不提供 RAW 编辑(损坏文件无法修复、高级字段无法编辑)。

## Decision

- **D1 env/headers 值全路径掩码**:结构化列表、表单回显、RAW 文本(GET 响应)中,`env` 与 `headers` 的**值**一律替换为占位符;永不回显明文,不提供「显示密钥」开关(对齐 ADR 0036 / 0038 D4)。
- **D2 占位符 round-trip 语义**:保存时占位符原样保留 = 保留磁盘原值;输入新值 = 覆盖。服务端在**所有**写路径(表单 upsert、enabled 一键切换、RAW PUT)落盘前执行占位符还原——**占位符字符串永不落盘**(否则一键开关会把 env 全部写成占位符字面量)。
- **D3 损坏文件例外**:JSON 无法解析时无法做树级掩码,RAW 兜底编辑显示磁盘原文(用户需要看到待修内容;blanking 会毁掉仅存内容)。掩码承诺仅覆盖合法 JSON;损坏文件的原文展示面向正在修文件的本机用户,属可接受例外。
- **D4 实现载体**:掩码/还原实现在 agent-core `mcp/config-store.ts`(`maskMcpSecrets` / `restoreMcpSecrets`,JSON 树遍历,按 key 名 `env`/`headers` 匹配,比 ADR 0038 的 TOML 行级正则简单)。合法文件的 RAW 视图是 `parse → mask → 规范化 serialize` 的产物——JSON 无注释,格式归一可接受(区别于 config.toml 的全保真 raw)。
- **D5 无 revision 乐观锁**(与 ADR 0038 D2 的差异是**有意的**):mcp.json 单用户本地低频写,读-改-写 + tmp+rename 原子写即可;多端并发编辑冲突防护留给未来(可在 config-store 上补 revision 而不动 UI 契约)。

## Consequences

### Positive

- 密钥明文永不跨线,ADR 0036 的威胁模型(token 泄漏 = 可改配置,不含密钥窃取)对 mcp.json 同样成立。
- 表单、enabled 开关、RAW 三条路径共用同一套掩码/还原逻辑,落在 core 单点实现,Web/TUI 未来共用。
- 损坏文件有页内修复通道,不依赖终端。

### Negative

- 表单中「值字段显示占位符、不动 = 保留原值」的交互需要文案解释(与 ADR 0038 同样的用户困惑成本)。
- 合法文件 RAW 保存会规范化 JSON 格式(缩进/键序),手工排版丢失;JSON 无注释,损失有限。
- 损坏文件的原文展示是掩码契约的已知破洞(仅限本机用户主动修复场景)。

## Alternatives Considered

- **明文回显**(Cursor / Claude 桌面端 MCP 编辑器的做法):实现最省,但与本项目自身密钥纪律冲突,token 持有者可读出 env 中的 API key。否决。
- **只写不读、不提供 RAW**:结构化列表仅显示「已配置 N 项」,合法文件无 RAW 编辑。省掉 round-trip,但高级字段(enabledTools/超时)失去编辑通道,损坏文件只能去终端修。否决——功能不完整。
- **损坏文件返回空文本**(对齐 config raw 的 `text:''` 行为):mcp.json 无内置默认结构,blanking 会让用户丢失待修内容。否决。
