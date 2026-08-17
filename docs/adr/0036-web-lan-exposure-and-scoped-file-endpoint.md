# 0036 - Web LAN 远程暴露：token 全权模型 + 作用域文件端点 + 密钥只写不读

日期：2026-08-14

## 状态

已接受（部分取代 ADR 0034 D4 的「v1 单用户回环、不做远程能力扩张」假设）；实现已随 PRD-0034 合入 dev

> **扩展（ADR 0038）**：D3「apiKey 只写不读」在 raw 配置编辑场景下扩展为「无损掩码」——`GET /api/config/raw` 以占位符显示密钥值、永不回显明文、保存占位符=保留原值；无明文回显开关。「任何 GET 恒脱敏」契约不变。

## 背景

PRD-0032 / ADR 0034 建立 web 客户端时，D4 明确：「v1 live-only、单用户回环……回环默认无 token，非回环强制 `WEB_AUTH_TOKEN`……不做多用户/并发隔离、无登录流」。

PRD-0034（工作台能力升级）将该产品推向真正的远程工作台：LAN 访问便利化（banner 列出含 token 的完整 URL）、作用域文件端点（生成文件查看 / 媒体预览）、provider 与 models 别名的可视化配置管理（web 写入 apiKey）。这些能力实质突破 D4 的边界。与其含糊地「默认继承」，不如显式声明新的威胁模型与护栏。

## 决策

### D1：LAN 威胁模型 = token 持有者即全权用户

非回环绑定仍强制 `WEB_AUTH_TOKEN`（沿 ADR 0034 机制，timing-safe 比较）；**不做**多用户、登录流、HTTPS（状态不变）。语义显式化：拿到 token 的局域网设备等同本人在操作——可读白名单内文件、可改写配置（含写入新 apiKey）、可驱动 agent 执行。token 经 URL `?token=` 传递是已知代价（EventSource 无法带 header）：启动 banner 提示「token 会进浏览器历史，建议用后轮换」。权限层（审批 / permission mode）按 ADR 0033 仍是 UX guard，不是安全边界。

### D2：文件端点 = 作用域白名单、只读、限额

新增 `GET /api/files`（query 传路径，不用通配路由）只服务两类前缀：

1. **已注册工作区根**：工作区注册表（非 hidden）∪ `session_index` 出现过的 workDir——即 `GET /api/workspaces` 返回的动态集合；
2. **媒体缓存**：`BYF_HOME/sessions/**/media-originals`。

护栏：realpath 规范化后校验前缀（防 `..` 与 symlink 穿越）；只读（无写、无删除）；文本 ≤2MB、媒体 ≤50MB、视频支持 HTTP Range（206）；目录请求 400；ETag（mtime+size）。不提供任意绝对路径访问。

### D3：apiKey 只写不读（结构性单向）

配置管理允许 web 写入 apiKey，但 wire 契约结构性单向：任何 GET 恒脱敏（仅 `hasApiKey`），编辑留空 = 不变，任何响应不回显密钥（参照 deepseek-harness credentials 契约——value 只在 `set` 时过线）。`env` 引用与 oauth 来源的 key 输入禁用 / 只读引导 CLI。

### D4：回环默认体验不变

回环绑定继续默认无 token、行为不变；LAN 是显式 opt-in（`-H` + token）。

## 结果

### 正面

- LAN 远程监控与交互（手机/平板查看进度、回答问题、处理审批）成为一等能力，且威胁模型显式化，后续评审有据可依。
- 密钥永不回显，即使 token 泄漏，已有密钥的泄露面也最小化。
- 文件端点护栏（白名单 + 限额 + 只读）把新增攻击面收敛到「读自己工作区内的文件」。

### 负面

- token 泄漏（浏览器历史 / 肩窥 / 日志）即全权、无二次防线——仅靠「建议轮换」提示缓解；不适合不受信网络环境，公网暴露被明确排除（仅局域网场景）。
- 文件端点是 web 首个读文件能力，需以专项安全用例（穿越/越界/超限/Range）长期守护。
- `?token=` 进 URL 的代价被正式接受（EventSource 限制），不可静默移除。

## 备选

- **文件端点仅回环可用（LAN 禁用）**：最保守，但手机/平板看不了生成文件，损失 PRD-0034 Wave C 一半价值。否决理由：与远程工作台目标矛盾。
- **任意路径 + token 保护**：方便看 home 下任意文件。否决理由：风险与收益不成比例。
- **在 ADR 0034 原文上修订 D4**：少一个文件，但一个 ADR 内两代假设并存，阅读易混淆。否决理由：决策史不清晰。

## 引用

- PRD-0034（`docs/prd/PRD-0034-web-workbench-upgrade.md`）
- ADR 0034（web 客户端传输骨架；其 D4 被本 ADR 部分取代）
- ADR 0033（权限层是 UX guard 而非安全边界）
- deepseek-harness credentials 契约（`packages/host/apiproxy/src/api/credentials.ts`，只写不读先例）
