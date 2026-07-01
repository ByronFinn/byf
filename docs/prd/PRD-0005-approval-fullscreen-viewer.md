# [DONE] PRD-0005: 审批全屏查看器 (Approval Fullscreen Viewer)

**状态**：Done
**创建日期**：2026-06-11
**作者**：BYF

## 子问题

- #122 — `FileViewerComponent` — 全屏文件/diff 查看器组件 (AFK)
- #123 — 将 Ctrl-E 接入全屏查看器 + 清理内联展开 (AFK, 阻塞于 #122)

## 问题

当代理请求批准 `Write` 或 `Edit` 工具调用时，审批面板挂载在编辑器位置并显示：

- **Edit**：集群 diff，截断到 10 行
- **Write**：语法高亮的文件内容，截断到 10 行

按下 `Ctrl-E` 当前切换面板内的行内展开。对于大文件或多处变更，展开后的内容仍然与选项和 footer 争夺空间，难以仔细审查。

## 目标

提供专门的全屏查看器，用于在审批期间审查文件内容和 diff，通过 `Ctrl-E` 触发。查看器给用户：

- 完整的 diff 或文件内容，支持滚动
- Vim 风格导航（`j`/`k`、`g`/`G`、`PgUp`/`PgDn`）
- `q`/`Esc` 返回审批面板做出选择

## 需求

### 功能

1. **Ctrl-E 打开全屏查看器**：从审批面板，当活跃调用有 `diff` 或 `file_content` 显示块时。替换当前的行内展开/折叠切换。
2. **Diff 查看器模式**：渲染完整的 diff（不截断），带行号、颜色编码的 `+`/`-`/上下文和文件路径头。
3. **文件内容查看器模式**：渲染完整的文件内容，带行号和语法高亮。
4. **滚动**：支持 `j`/`k`（行）、`PgUp`/`PgDn`（页）、`g`/`G`（首/尾），鼠标滚轮（如果支持）。
5. **关闭**：`q` 或 `Esc` 关闭查看器，返回审批面板，保持相同状态（选择索引不变）。
6. **Footer**：显示位置指示器（`10-45 / 120 (33%)`）和导航提示，类似 `TaskOutputViewer`。

### 非功能

- 重用现有的全屏机制（`showFullscreen`/`closeFullscreen`），已由 `TaskOutputViewer` 使用。
- 共享相同的调色板系统，使查看器匹配主题。
- 无新依赖。

### 非目标

- 并排 diff 对比（如原始 vs 新版并列显示）。
- 查看器内搜索。
- 针对 `shell`、`file_op` 或其他显示块类型的全屏查看器。
- 核心审批协议的任何变更（SDK/agent-core 类型保持不变）。

## 技术方案

### 架构

现有的 `byf-tui.ts` 中的全屏机制：

```ts
showFullscreen: (component) => {
  const saved = [...this.state.ui.children];
  this.state.ui.clear();
  this.state.ui.addChild(component);
  return saved;
},
closeFullscreen: (savedChildren) => {
  this.state.ui.clear();
  for (const child of savedChildren) this.state.ui.addChild(child);
  this.state.ui.setFocus(this.state.editor);
},
```

### 组件设计

在 `apps/cli/src/tui/components/dialogs/file-viewer.ts` 中创建新组件 `FileViewerComponent`（或与 `task-output-viewer.ts` 放在一起）。

**Props** — 接受预计算的渲染行和元数据，而非原始 display blocks。调用者（在 `byf-tui.ts` 中）在构造查看器之前将块解析为行：

```ts
interface FileViewerSection {
  header: string; // 如 diff: "+3 -2 src/foo.ts"，内容: "src/foo.ts"
  lines: string[]; // 预渲染的 ANSI 行
}

interface FileViewerProps {
  sections: FileViewerSection[]; // 每个可展开块一个，在查看器中连接
  colors: ColorPalette;
  onClose: () => void;
}
```

这种设计避免将查看器耦合到 `DisplayBlock` 内部——适配逻辑保留在审批面板层。

**内部实现**：

- 在构造函数中接受 `Terminal`（与 `TaskOutputViewer` 相同模式）用于计算可见行数
- `onClose` 通过构造函数 props 传入（非构造后赋值——与 `TaskOutputViewer` 一致）
- 将所有 sections 扁平化为单个可滚动行数组：section 头成为分隔行
- 维护 `scrollTop` 滚动状态
- 使用与 `TaskOutputViewer` 相同的 render/input 生命周期模式

**Diff 渲染**（所有行，不省略）：

- 行格式：`gutter + marker + content`
  - 新增行：`  42  + new code here`
  - 删除行：`  41  - old code here`
  - 上下文行：`  42    existing code`
- Section 头行：`+3 -2 path/to/file.ts`
- 直接使用 `computeDiffLines`（而非 `renderDiffLinesClustered`）——显示每一行，包括上下文

**文件内容渲染**：

- 行格式：`gutter + highlighted line`
  - `   1  import { foo } from 'bar';`
- 如果语言不支持，回退到纯文本 `split('\n')`（与 `highlightLines` 相同）

**多个块**：当审批有多个可展开块时，所有块在查看器中作为 sections 渲染，由 header 分隔。查看器将它们连接成单个可滚动视图。

**Footer**：与 `TaskOutputViewer` 相同样式——左侧位置指示器，右侧导航提示。

**焦点恢复**：`onClose` 回调关闭全屏，然后将焦点设置回审批面板组件。

### 审批面板集成

**Ctrl-E 处理器** — 用全屏打开替换行内切换：

```ts
// 改前：
if (matchesKey(data, Key.ctrl('e'))) {
  this.expanded = !this.expanded;
  this.onTogglePlanExpand?.();
  return;
}

// 改后：
if (matchesKey(data, Key.ctrl('e'))) {
  this.onViewFullscreen?.();
  return;
}
```

**清理**：`expanded` 字段成为死代码，应移除。Footer 提示从切换（expand/collapse）改为固定操作标签。`renderDisplayBlock` 中针对 `file_content` 块的行内截断提示 `(ctrl+e to expand)` 应更新为 `(ctrl+e to view)` 或类似。

面板需要一个注入到构造函数的回调：

```ts
constructor(
  request, onResponse, colors,
  onToggleToolOutput?,
  onTogglePlanExpand?,
  onViewFullscreen?,    // 新增 — 打开全屏查看器，处理焦点恢复
)
```

**注意**：`onTogglePlanExpand` 对于审批面板是死代码（`byf-tui.ts` 从未提供，始终为 `undefined`）。可以暂时保留，因为 `QuestionDialogComponent` 使用相同的接口，或者单独清理。

在 `byf-tui.ts` 中接入回调。回调解析可展开块、预计算渲染行、构造查看器并捕获面板引用用于焦点恢复：

```ts
const openFullscreenViewer = () => {
  const expandableBlocks = payload.display.filter(
    (b) => b.type === 'diff' || b.type === 'file_content',
  );
  if (expandableBlocks.length === 0) return;
  const sections = expandableBlocks.map((b) => resolveSection(b, this.state.theme.colors));
  const saved = [...this.state.ui.children];
  this.state.ui.clear();
  const viewer = new FileViewerComponent(
    {
      sections,
      colors: this.state.theme.colors,
      onClose: () => {
        this.state.ui.clear();
        for (const child of saved) this.state.ui.addChild(child);
        this.state.ui.setFocus(panel);
        this.state.ui.requestRender(true);
      },
    },
    this.state.terminal,
  );
  this.state.ui.addChild(viewer);
  this.state.ui.setFocus(viewer);
  this.state.ui.requestRender(true);
};
```

### 文件变更

| 文件 | 变更 |
| --- | --- |
| `apps/cli/src/tui/components/dialogs/file-viewer.ts` | **新增** — 全屏 diff/文件内容查看器组件 |
| `apps/cli/src/tui/components/dialogs/approval-panel.ts` | 添加 `onViewFullscreen` 回调，将 Ctrl-E 接入 |
| `apps/cli/src/tui/byf-tui.ts` | 向 `ApprovalPanelComponent` 传递 `onViewFullscreen` 回调 + `Terminal` 引用 |

注意：`computeDiffLines` 和 `highlightLines` 直接重用；不需要改动 `diff-preview.ts` 或 `code-highlight.ts`。

## 扩展考虑

### 未来演进

- **查看器内搜索**：添加 `/` 键搜索，`n`/`N` 下一个/上一个（类似 `less`）
- **并排 diff**：在宽终端中并排显示新旧列
- **其他块类型**：shell 命令输出、URL 抓取结果的全屏查看
- **行内预览切换**：被全屏查看器取代（见已做决策）

### 边界情况

- 空 diff（无变更）：查看器仍然打开，但显示 "no changes" 消息
- 超大文件（>10000 行）：预先计算所有行，但仅渲染可见窗口（已经与 `TaskOutputViewer` 使用的模式相同）
- 查看器打开时终端大小变化：查看器在下一个 tick 重新渲染（pi-tui 处理）
- 无可用展开块：如果用户在 `shell` 或 `file_op` 审批上按 Ctrl-E，`onViewFullscreen` 未提供（回调为 `undefined`），`?.()` 是空操作
- 多个可展开块：所有块在查看器中作为 sections 显示，由 header 分隔

## 关键决策

| 决策 | 理由 |
| --- | --- |
| 新建 `FileViewerComponent` 而非扩展 `TaskOutputViewer` | 渲染需求不同（diff 标记、语法高亮 vs 纯文本）。共享模式，不同输出。 |
| Ctrl-E 打开全屏，替换行内切换 | 全屏对审查更有用；行内切换只有 10 行 vs 全部行。全屏查看器取代这个需求。 |
| `q`/`Esc` 关闭 | 与 `TaskOutputViewer` 和标准分页器惯例一致 |
| 在构造函数中计算行 | Diff 算法（LCS）是 O(n\*m)——最好计算一次而非每次渲染。与 `TaskOutputViewer` 相同模式。 |
| 与任务查看器相同的全屏机制 | 已验证的模式，无需新基础设施 |

## 未知项

| 问题 | 原因 | 解决方案 |
| --- | --- | --- |
| Diff 显示原始行号？ | `computeDiffLines` 已经分配了 `lineNum`。查看器是否应该对删除行显示旧文件行号、对新增行显示新文件行号？ | 是的，这是标准做法，已经可用 |

## 已做决策

| 决策 | 结果 | 理由 |
| --- | --- | --- |
| 行内展开切换 | 由全屏查看器取代。Ctrl-E 现在打开全屏，不再切换行内。`expanded` 字段移除。 | 全屏对审查更有用；更清晰的思维模型 |
| 焦点恢复 | 查看器 `onClose` 回调恢复 UI children，然后 `setFocus(panel)`。 | 避免更改 `closeFullscreen` 签名；对现有 TasksBrowser 调用者影响最小 |
| Diff 渲染 | 显示所有行（add/delete/context），不省略。 | 全屏有足够空间；用户希望看清楚一切 |
| 关闭后状态 | 保持折叠（10 行）。 | "全屏审查→返回审批"思维模型；避免选项遮挡 |
| 多个块 | 所有可展开块在单个查看器中作为 sections 显示。 | 与当前"全部展开"行为一致；比逐块选择更简单 |
| Props 设计 | 查看器接受预计算的 `FileViewerSection[]`，而非原始 `DisplayBlock`。 | 将查看器与块内部分离；适配逻辑保留在审批面板层 |
| Footer 提示 | 从切换（expand/collapse）改为固定操作（`ctrl+e view`）。 | Ctrl-E 不再是切换操作 |
