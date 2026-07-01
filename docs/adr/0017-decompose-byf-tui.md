# ADR 0017: 将 ByfTui 分解为独立模块

## 状态

已接受

## 背景

`ByfTui`（`apps/cli/src/tui/byf-tui.ts`）是一个 5623 行的类，包含 16 个职责部分。虽然 `apps/cli/AGENTS.md` 将各部分边界定义为约定，但代码中没有任何强制机制。理解或测试任何一个部分都需要浏览整个文件。

三个目标推动这次分解：

1. **可测试性**——独立模块具有可测试的接口，而不仅仅是通过 ByfTui 的集成测试。
2. **可导航性**——每个部分成为自己的文件。
3. **可复用性**——提取的模块不依赖 ByfTui 实例，使其可从非交互模式或未来的 API 入口使用。

## 决策

### 设计原则

- **ByfTui 仍是唯一的状态所有者。** 提取的模块将状态作为参数接收（或通过构造函数注入）；它们从不持有对 TUIState 的可变引用。
- **纯逻辑成为独立函数。** 不依赖 UI 状态的模块提取为普通函数。
- **无透传模块。** 简单的斜杠命令（各 3-5 行）和状态助手留在 ByfTui 中——提取它们会创建浅包装。

### 状态注入：直接引用，而非快照组装（2026-06-24 修订）

原始措辞（"从不持有对 TUIState 的可变引用"）的实现方式是为每个处理器让 ByfTui 组装一个新鲜的 getter/setter 快照对象——例如 `turnEventState()` 返回一个 59 行的 `get x() { return state.x; }` 转发器对象。这创建了**适配器层税**：每个提取的基于类的处理器都迫使 ByfTui 增长一个新的 `xxxState()` 组装方法（累计约 540 行）。分解路径在跟自己作对——ADR-0017 提取的模块越多，ByfTui 越大。

第一性原理审查显示"永不持有"规则被误用：ByfTui 及其处理器是**同一编译单元**中的对象，而非跨信任边界的服务。该规则寻求的最小权限保证已经由 **TypeScript 在编译时的结构类型系统**提供——针对 `TurnEventState` 类型化的处理器无法访问 `state.sessions`，无论它持有哪个运行时对象。运行时 getter 快照只是复制了这个编译时保证（而且不完整——像 `appState` 这样的引用类型通过快照仍然可变）。

**修订后的规则：** 基于类的处理器（`TurnEventHandler`、`CompactionHandler`、`BackgroundTaskHandler`）现在在构造时直接接收 `this.state` 并在其生命周期内持有。ByfTui 针对这三个处理器的 `*State()` 组装方法被删除（约 85 行）。处理器的 `XxxState` 接口仍然是声明每个处理器读取哪些字段的狭窄契约，由编译器强制执行——`CompactionState` 和 `BackgroundTaskState` 不动；只有 `TurnEventState` 对齐到 TUIState 的真实形态（`colors: ColorPalette` → `theme: ByfTuiThemeBundle`，因为处理器读取 `theme.colors.error`，而 TUIState 在 `theme` 下嵌套存储 colors）。

**此修订的范围——有意限制：**

- **基于类的处理器**：状态组装删除；处理器直接持有 `this.state`。回调组装（`*Callbacks()`）保留——回调是*行为*适配器（绑定 ByfTui 方法 + 内联逻辑如 `notifyTurnComplete`），具有真正的封装价值，与纯字段转发不同。
- **自由函数处理器**（`handleStatusUpdate`、`handleSkillActivated`、`subagentEventHandler`）：它们的 `*State()` 投影保留。这些执行真正的字段重映射（如 `SessionMetaState` 将 `appState.sessionId` 提升为顶层字段）或方法适配器（`SubagentEventState` 是基于 Map 操作的 20 方法接口），因此它们是狭窄投影，而非透传外壳。

### 模块映射

| 模块                     | 位置                                         | 行数（约） | 从 ByfTui 提取自                       |
| ------------------------ | -------------------------------------------- | ---------- | -------------------------------------- |
| `TurnEventHandler`       | `src/tui/events/turn-event-handler.ts`       | 1137       | 会话事件（turn 相关）+ 实时渲染钩子    |
| `SessionMetaHandler`     | `src/tui/events/session-meta-handler.ts`     | 200        | 会话事件（会话级）                     |
| `SubagentEventHandler`   | `src/tui/events/subagent-event-handler.ts`   | 200        | 会话事件（subagent）                   |
| `TranscriptRenderer`     | `src/tui/actions/transcript-renderer.ts`     | 233        | Transcript 渲染                        |
| `LoginFlow`              | `src/tui/flows/login-flow.ts`                | 468        | 斜杠命令处理器（`/login`）             |
| `ConnectFlow`            | `src/tui/flows/connect-flow.ts`              | 200        | 斜杠命令处理器（`/connect`）           |
| `TasksBrowserController` | `src/tui/components/dialogs/tasks-browser/`  | 840        | 后台任务浏览器                         |
| `DialogHost` 接口        | `src/tui/types.ts`                           | 20         | 在 `mountEditorReplacement` 上的新抽象 |
| `BackgroundTaskHandler`  | `src/tui/events/background-task-handler.ts`  | 159        | 后台任务生命周期                       |
| `CompactionHandler`      | `src/tui/events/compaction-handler.ts`       | 74         | 会话运行时（压缩生命周期）             |
| `handleSkillActivated`   | `src/tui/events/skill-activation-handler.ts` | 37         | 会话事件（技能激活）                   |

### 留在 ByfTui 的内容

- 类型与状态创建、启动助手、生命周期、认证/模型引导
- 布局/编辑器设置、输入分发
- 会话请求/队列、状态助手（29 行）
- 会话运行时（turn 分发、流式状态）、面板/呈现状态
- 对话框/选择器（挂载逻辑）
- 简单斜杠命令和选择器触发的命令

### DialogHost 接口

```ts
interface DialogHost {
  show(panel: Component & Focusable): void;
  close(): void;
}
```

项目已有约 15 个对话框组件。DialogHost 将现有的 `mountEditorReplacement` 模式形式化，使业务流（LoginFlow、TasksBrowserController）不需要了解编辑器替换的内部细节。

我们拒绝了两个替代方案：

- **回调注入**（`{ mountDialog, unmountDialog, ... }`）——对 2 个对话框可行，但有 15 个时重复信号表明缺少抽象。
- **InteractionHost**（`showPicker/showForm/showConfirm`）——框架级抽象对产品来说为时过早。pi-tui 组件是命令式的；每个对话框有截然不同的构造需求。如果 BYF 添加 Web UI 或 API 服务器模式，重新评估。

### 实现顺序

1. **DialogHost 接口**——最小变更，解锁后续步骤。
2. **TranscriptRenderer**——纯函数提取，零风险，无依赖。
3. **三个事件处理器**——最大变更；TurnEventHandler 依赖 TranscriptRenderer。
4. **LoginFlow + TasksBrowserController**——依赖 DialogHost；最自包含。

每步都可独立测试，无回归。

## 结果

- **正面：** 每个提取的模块有自己的测试面。Turn 生命周期、事件路由和业务流可以在不启动完整 ByfTui 实例的情况下测试。
- **正面：** 浏览代码库不再需要滚动 5600 行。
- **正面：** TranscriptRenderer 和 LoginFlow 可从非交互入口点复用。
- **负面：** 更多需要跟踪的文件。分解向 TUI 目录添加了约 7 个新文件。
- **负面：** TurnEventHandler 约 1137 行仍然很大，但它封装了单一的职责（turn 生命周期），具有狭窄接口——深度而非广度。
