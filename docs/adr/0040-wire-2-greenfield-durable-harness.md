# 0040 - wire 协议 2.0 greenfield：entries 树 + records 分离，放弃旧会话

Date: 2026-08-23

## 状态

有效（2026-08-23，PRD-0037 已批准）。取代 ADR-0031 的"暂不迁移"立场与 ADR-0032 的"record 名与落盘字节兼容、零迁移"路线；ADR-0020 的 fork 截断锚点机制随 2.0 导航落地后作废。

## 背景

pi v2《Durable AgentHarness design》确立了以持久化为第一设计轴的会话架构：对话树（entries，parentId 链）与执行日志（records，lane 操作日志）分层存储、单调 seq 贯穿、意图先行（效果前写意图记录 + 预分配 id）、崩溃后恢复为 suspended 可续跑。PRD-0037 的冲突调研确认 byf 现状与之存在结构性冲突：

- 每 agent 一份 `wire.jsonl` 混装对话内容与执行事实（26 种 record），无法满足"删掉全部 records 仍是完整对话"不变量；
- 线性 `ContextMessage[]` 历史，无树、无 lane、无导航；回退依赖目录复制 + 截断（ADR-0020）；
- 无单调 seq；turnId 内存计数不稳定；
- 崩溃后恢复为 idle，中断操作不续跑、悬空 tool.call 永久悬空、重试计数随进程丢失。

ADR-0032 当年选择字节兼容，前提是"自研 reducer、record 名与落盘字节不变"；该前提在采纳 v2 树形格式后不再成立——线性 journal 无法字节兼容地承载 entries 树与 records 分离。

## 决策

1. **wire 协议 2.0 greenfield**：全新格式——entries（七类）+ records（lane 操作日志）+ lanes + global facts（append-only）+ 单调 seq；会话级单文件 `sessions/<id>/wire.jsonl`（lane 为信封字段）。不在 1.1 上演化，不写 1.1→2.0 转换。
2. **放弃旧会话**：旧 1.1 会话不保证可打开。无读转换、无惰性重写、无迁移工具（比 pi v2"打开恢复 idle + 首次追加时重写一次"的兼容政策更激进）。
3. **旧会话在 UI 隐藏**：session_index 增加格式版本字段，旧格式会话从列表隐藏；磁盘文件不删；误打开时报清晰错误。
4. 推翻的决策：ADR-0031（备选迁移路径不再相关）、ADR-0032 的字节兼容路线（reducer 归约哲学保留，格式重写）、ADR-0020（树导航 + branch summary 取代 fork 截断锚点；持久 runId 取代"第 N 条 user prompt"锚点）。

## 理由

1. **终态已裁决全量采纳**（PRD-0037 D1）：树与 records 分离是 lanes、导航、确定性子会话 id 的前提；在 1.1 上做临时记录层再迁树会被重写两次。
2. **旧会话数据价值低**：个人工具，历史会话无协作依赖；兼容路径（读时投影、惰性重写、迁移工具）每一项都是独立工程面。
3. **兼容是设计自由的代价**：pi v2 文档把兼容政策压到最小（仅"打开恢复 idle"），并明言"其余一切皆可破坏"；byf 连这一条也裁掉，换取完全干净的 greenfield。

## 结果

### 正面

- 设计不受 1.1 形状约束：seq、tree/records 分层、provisioned id、lane 信封全部原生；
- 删除全部版本迁移代码路径（迁移链、读时兼容、双格式测试面）；
- ADR-0032 的归约哲学（状态=记录的归约、live/restore 同 apply）在新格式内延续。

### 负面 / 需接受

- **不可逆**：升级后现存 1.1 会话不可用（UI 隐藏、不可打开）。用户升级前须知；
- 两代格式在磁盘上并存（旧目录不删），直到用户手动清理；
- Phase 0-4 期间新旧两套引擎代码并存（见 ADR-0041），维护面翻倍直至切换删除。

## 参考

- PRD-0037：Durable Agent Harness（决策 D1/D2，实施 Phase 0）
- pi v2《Durable AgentHarness design》（用户提供全文）
- ADR-0031、ADR-0032（被取代路线）、ADR-0020（被作废锚点机制）
