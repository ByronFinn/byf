# 0027 - Goal footer 本地 timer + wallClockMs 外推

日期：2026-07-06

## 状态

已接受

## 背景

PRD-0019 N3 规定 goal 计步（`incrementTurn` / `addTokenUsage`）为 silent——写 wire record 保证 replay 一致，但**不 emit `goal.updated` 事件**，避免每步推送扰扰 UI。事件只在 turn 边界（driver 续跑时显式 `emitUsageUpdate`）或生命周期变化（create/pause/resume/blocked/complete）时才发。

结果是 footer 的 `turns` / `tokens` / `elapsed` 在单个 turn 内部（LLM 流式输出 + tool 执行 + 多个 step）完全静止——用户体感"完成才更新"。最影响体感的是 `elapsed`：明明 goal 已经跑了 30 秒，footer 还停在 `0s`，直到下一个 turn 边界才跳。

byf 已有后端能力补足 elapsed 的实时性：

- `GoalMode.getLiveWallClockMs()`（`agent/goal/index.ts:249`）：active 期间返回 `accumulated + (Date.now() - wallClockResumedAt)`，mid-turn 读取准确。
- `emitUsageUpdate()`（`agent/goal/index.ts:214`）：emit 时已 overlay live wall-clock 进 snapshot。

但 `wallClockResumedAt` 是 `GoalMode` 的 private 字段，不进 `GoalSnapshot`，UI 无法直接算实时墙钟。且即便事件携带了 live 值，**两次事件之间** footer 仍是静态的（footer 是纯函数渲染，只在 `setAppState` → `ui.requestRender()` 时重绘）。

参照系 Kimi Code：其 `recordTokenUsage` 同样 `silent: true`（注释明说"per-step token / wall-clock accounting so the UI is not updated on every step"），token 也是回合级。但 footer（`apps/kimi-code/src/tui/components/chrome/footer.ts:370-384`）持有 1 秒 `setInterval` + `goalObservedAtMs` 锚点，用 `Date.now() - observedAt` 在 snapshot.wallClockMs 基础上**本地外推**显示 elapsed，让用户看到秒在跳动。这是其"实时感"的唯一真正秒级机制。

## 决策

**byf 采纳 Kimi Code 式 footer 本地 timer——`FooterComponent` 在 goal active 时跑 1 秒 `setInterval`（`unref`），用 `goalObservedAtMs` 锚点 + `Date.now()` 在 snapshot.wallClockMs 基础上外推显示 elapsed。**

具体：

- `FooterComponent` 新增 1 秒 `setInterval`（`GOAL_TIMER_INTERVAL_MS`），`status === 'active'` 时启动（幂等）、否则 clear。`unref()` 保证不阻塞进程退出。
- `goalObservedAtMs` 锚点：只在 goal snapshot 关键字段**真的变化**时（`goalSnapshotKey` 判变，拼 objective/status/reasons/turns/tokens/wallClockMs/budget/createdAt）才重置。无关 `setState`（git/permission/cwd 变化都走同一入口）不重置锚点，否则外推增量永远接近 0。
- `goalWallClockMs()`：active → `snapshot.wallClockMs + max(0, Date.now() - goalObservedAtMs)`；非 active / null → 原值。
- 外推条件**严格 `status === 'active'`**：complete 瞬态期间 `wallClockResumedAt` 已被 fold 定格，外推会高估，必须显示定格值。
- `dispose()` 清 timer；`byf-tui.ts stop()` teardown（`stopAllMcpServerStatusSpinners` 之后、`ui.stop` 之前）接线，**不**加到 `emergencyTerminalExit`（刻意不写终端）。

**不反转 N3**：turns/tokens 维持回合级（与 Kimi Code 完全对齐），`emitUsageUpdate` 频率不变。耗时秒级实时由 UI 端 timer 独立承担。

另（#207，与本 ADR 同批）：`driveGoal` 在首个 user turn `incrementTurn` 后补一句 `emitUsageUpdate()`，消除"footer 的 turns 跳过 1 直接到 2"的首轮盲区（首轮 silent + 循环内 emit 在第一个 continuation turn 跑完之后）。这是 N3 silent 设计下的最小补丁，不触及 R4 首轮 token 记账口径。

## 结果

### 正面

- elapsed 真正每秒跳动——用户体感最强烈的单一改进。从"完成才更新"跃升到"一直在动"。
- 零后端 / 协议 / RPC 改动（timer 纯 UI 层）。`emitUsageUpdate` / `getLiveWallClockMs` 等后端能力已存在，复用既有路径。
- 不影响 replay：进程重启后 `normalizeAfterReplay`（`goal/index.ts:313`）把 active 降级为 paused，replay 期间 timer 不启动。
- 不阻塞进程退出（`unref` + `dispose` 双保险）。
- complete 瞬态显示定格值（外推条件严格 active），不会因外推高估耗时。

### 负面

- footer 持有 `setInterval` 是 UI 组件的隐式状态，未来维护者看到 `goalObservedAtMs` + 外推逻辑可能困惑"为什么不直接读 snapshot"。本 ADR 即为解答此困惑而存在。
- 外推值与真实 wallClockMs 在事件到达时刻会有 ms 级偏差（外推基于本地 `Date.now()`，落盘 record 写折叠累积值）。偏差在下一次 `goal.updated` 事件到达时被校正（锚点重置），用户不可察觉。
- turns/tokens 仍回合级（与 Kimi Code 一致）。若未来要求 step 级 token 实时，需反转 N3（新 ADR），事件量上升，本 ADR 不覆盖。

## 考虑的替代方案

- **A 方案（反转 N3，per-step emit）**：在 `runTurn` 的 `afterStep` hook 把每步 token 增量推进 goal 并 `emitUsageUpdate`。被拒绝：事件量上升（每个 LLM 调用一次跨进程事件），且 Kimi Code 自己都没这么做——其 token 也是回合级 silent。用户体感的"实时感"主要由 elapsed 跳秒驱动，per-step token 收益有限、成本较高。
- **B 方案（driveGoal 内周期性 emit）**：在 `await waitForCurrentTurn()` 期间用 `setInterval` 周期调 `emitUsageUpdate`。被拒绝：token 在 turn 内未记账，周期 emit 只能刷新 elapsed——而本 ADR 的 UI timer 已用更便宜的方式（本地 `Date.now()`）覆盖了 elapsed，重复造轮子，跨进程开销大于本地 timer。
- **C 方案（把 wallClockResumedAt 暴露进 snapshot）**：让 UI 直接算实时墙钟。被拒绝：`wallClockResumedAt` 是 GoalMode 内部计时实现细节，进 snapshot 会泄露内部状态、扩大公开 API 表面，且 UI 仍需 timer 触发重绘——不解决问题，只是换了外推的输入。

## 关联

- 修订 PRD-0019 N3 旁注 / Traceability（N3 决策未反转，elapsed 实时性盲区由本 ADR 的 footer 本地 timer 补足）。
- 与 ADR-0022（Goal Reminder 走 Ephemeral Injection）正交：本 ADR 只管 footer 显示层，reminder 注入机制不受影响。
- 与 ADR-0024（Goal 终态停止靠 Driver 边界读状态）协同：complete 瞬态的外推边界（严格 active）依赖 driver 边界 clear 的时序语义。
