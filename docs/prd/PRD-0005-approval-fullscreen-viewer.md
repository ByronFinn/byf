# PRD-0005: Approval Fullscreen Viewer

**Status**: Done
**Created**: 2026-06-11
**Author**: BYF

## Child Issues

- #122 — `FileViewerComponent` — fullscreen file/diff viewer component (AFK)
- #123 — Wire Ctrl-E to fullscreen viewer + cleanup inline expand (AFK, blocked by #122)

## Problem

When the agent requests approval for `Write` or `Edit` tool calls, the approval panel mounts in the editor slot and shows:
- **Edit**: a clustered diff, truncated to 10 lines
- **Write**: syntax-highlighted file content, truncated to 10 lines

Pressing `Ctrl-E` currently toggles inline expansion within the panel. For large files or many changes, the expanded content still competes for space with choices and the footer, making it hard to review thoroughly.

## Goal

Provide a dedicated full-screen viewer for reviewing file content and diffs during approval, triggered by `Ctrl-E`. The viewer gives the user:
- The entire diff or file content with scrolling
- Vim-style navigation (`j`/`k`, `g`/`G`, `PgUp`/`PgDn`)
- `q`/`Esc` to return to the approval panel to make a choice

## Requirements

### Functional

1. **Ctrl-E opens fullscreen viewer** from the approval panel when the active call has a `diff` or `file_content` display block. This replaces the current inline expand/collapse toggle.
2. **Diff viewer mode**: renders the complete diff (no truncation) with line numbers, color-coded `+`/`-`/context, and the file path header.
3. **File content viewer mode**: renders the complete file content with line numbers and syntax highlighting.
4. **Scrolling**: supports `j`/`k` (line), `PgUp`/`PgDn` (page), `g`/`G` (top/bottom), mouse wheel if available.
5. **Close**: `q` or `Esc` closes the viewer and returns focus to the approval panel in the same state (selection index preserved).
6. **Footer**: shows position indicator (`10-45 / 120 (33%)`) and navigation hints, similar to `TaskOutputViewer`.

### Non-functional

- Reuse the existing fullscreen mechanism (`showFullscreen`/`closeFullscreen`) already used by `TaskOutputViewer`.
- Share the same color palette system so the viewer matches the theme.
- No new dependencies.

### Out of Scope

- Side-by-side diff comparison (e.g. original vs new in parallel columns).
- Search within the viewer.
- Fullscreen viewer for `shell`, `file_op`, or other display block types.
- Any changes to the core approval protocol (SDK/agent-core types remain unchanged).

## Technical Approach

### Architecture

The existing fullscreen mechanism in `byf-tui.ts`:
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

### Component Design

Create a new component `FileViewerComponent` in `apps/cli/src/tui/components/dialogs/file-viewer.ts` (or co-locate with `task-output-viewer.ts`).

**Props** — accepts pre-computed render lines and metadata, not raw display blocks. The caller (in `byf-tui.ts`) resolves blocks to lines before constructing the viewer:
```ts
interface FileViewerSection {
  header: string;    // e.g. "+3 -2 src/foo.ts" for diff, "src/foo.ts" for content
  lines: string[];   // pre-rendered ANSI lines
}

interface FileViewerProps {
  sections: FileViewerSection[];  // one per expandable block, concatenated in viewer
  colors: ColorPalette;
  onClose: () => void;
}
```

This design avoids coupling the viewer to `DisplayBlock` internals — the adapter logic stays in the approval panel layer.

**Internals**:
- Takes `Terminal` in constructor (same pattern as `TaskOutputViewer`) for computing visible rows
- `onClose` passed in constructor props (not post-construction assignment — consistent with `TaskOutputViewer`)
- Flattens all sections into a single scrollable line array: section headers become separator lines
- Maintains `scrollTop` for scrolling state
- Uses the same pattern as `TaskOutputViewer` for render/input lifecycle

**Diff rendering** (all lines, no elision):
- Line format: `gutter + marker + content`
  - Added lines: `  42  + new code here`
  - Deleted lines: `  41  - old code here`
  - Context lines: `  42    existing code`
- Section header row: `+3 -2 path/to/file.ts`
- Uses `computeDiffLines` directly (not `renderDiffLinesClustered`) — shows every line including context

**File content rendering**:
- Line format: `gutter + highlighted line`
  - `   1  import { foo } from 'bar';`
- Falls back to plain `split('\n')` if language not supported (same as `highlightLines`)

**Multiple blocks**: When the approval has multiple expandable blocks, all are rendered as sections in the viewer, separated by their headers. The viewer concatenates them into one scrollable view.

**Footer**: same style as `TaskOutputViewer` — position indicator left, navigation hints right.

**Focus recovery**: `onClose` callback closes fullscreen then sets focus back to the approval panel component.

### Approval Panel Integration

**Ctrl-E handler** — replace inline toggle with fullscreen open:

```ts
// BEFORE:
if (matchesKey(data, Key.ctrl('e'))) {
  this.expanded = !this.expanded;
  this.onTogglePlanExpand?.();
  return;
}

// AFTER:
if (matchesKey(data, Key.ctrl('e'))) {
  this.onViewFullscreen?.();
  return;
}
```

**Cleanup**: The `expanded` field becomes dead code and should be removed. The footer hint changes from a toggle (`expand`/`collapse`) to a fixed action label. The inline truncation hint `(ctrl+e to expand)` in `renderDisplayBlock` for `file_content` blocks should be updated to `(ctrl+e to view)` or similar.

The panel needs a callback injected into the constructor:
```ts
constructor(
  request, onResponse, colors,
  onToggleToolOutput?,
  onTogglePlanExpand?,
  onViewFullscreen?,    // NEW — opens fullscreen viewer, handles focus recovery
)
```

**Note**: `onTogglePlanExpand` is dead code for approval panels (never provided by `byf-tui.ts`, always `undefined`). It can be kept for now since `QuestionDialogComponent` uses the same interface, or cleaned up separately.

In `byf-tui.ts`, wire the callback. The callback resolves expandable blocks, pre-computes render lines, constructs the viewer, and captures the panel reference for focus recovery:
```ts
const openFullscreenViewer = () => {
  const expandableBlocks = payload.display.filter(
    (b) => b.type === 'diff' || b.type === 'file_content'
  );
  if (expandableBlocks.length === 0) return;
  const sections = expandableBlocks.map(b => resolveSection(b, this.state.theme.colors));
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

### File Changes

| File | Change |
|------|--------|
| `apps/cli/src/tui/components/dialogs/file-viewer.ts` | **New** — fullscreen diff/file content viewer component |
| `apps/cli/src/tui/components/dialogs/approval-panel.ts` | Add `onViewFullscreen` callback, wire Ctrl-E to invoke it |
| `apps/cli/src/tui/byf-tui.ts` | Pass `onViewFullscreen` callback + `Terminal` reference to `ApprovalPanelComponent` |

Note: `computeDiffLines` and `highlightLines` are reused directly; no changes to `diff-preview.ts` or `code-highlight.ts` needed.

## Expansion Considerations

### Future Evolution
- **Search in viewer**: add `/` key for search, `n`/`N` for next/prev (like `less`)
- **Side-by-side diff**: show old/new columns side by side in wide terminals
- **Other block types**: fullscreen for shell command output, URL fetch results
- **Inline preview toggle**: replaced by fullscreen (see Decisions Made)

### Edge Cases
- Empty diff (no changes): viewer still opens but shows "no changes" message
- Very large files (>10000 lines): compute all lines upfront but render only visible window (already the pattern used by `TaskOutputViewer`)
- Terminal resize during viewer: viewer re-renders on next tick (pi-tui handles this)
- No expandable block: if user presses Ctrl-E on a `shell` or `file_op` approval, `onViewFullscreen` is not provided (callback is `undefined`), so `?.()` is a no-op
- Multiple expandable blocks: all are shown as sections in the viewer, separated by headers

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| New `FileViewerComponent` instead of extending `TaskOutputViewer` | Different rendering needs (diff markers, syntax highlighting vs plain text). Shared patterns, different output. |
| Ctrl-E opens fullscreen, replacing inline toggle | Fullscreen is more useful for review; inline toggle was only 10 lines vs all lines. The fullscreen viewer subsumes this need. |
| `q`/`Esc` to close | Consistent with `TaskOutputViewer` and standard pager conventions |
| Compute lines in constructor | Diff algorithm (LCS) is O(n*m) — better to compute once than per-render. Same pattern as `TaskOutputViewer`. |
| Same fullscreen mechanism as task viewer | Proven pattern, no new infrastructure needed |

## Unknowns

| Question | Why | Resolution |
|----------|-----|-----------|
| Show original line numbers for diff? | `computeDiffLines` already assigns `lineNum`. Should the viewer show old file line numbers for deleted lines and new file line numbers for added lines? | Yes, this is standard and already works |

## Decisions Made

| Decision | Outcome | Rationale |
|----------|---------|-----------|
| Inline expand toggle | Replaced by fullscreen viewer. Ctrl-E now opens fullscreen, no longer toggles inline. `expanded` field removed. | Fullscreen is more useful for review; cleaner mental model |
| Focus recovery | Viewer `onClose` callback restores UI children then `setFocus(panel)`. | Avoids changing `closeFullscreen` signature; minimal impact on existing TasksBrowser callers |
| Diff rendering | Show all lines (add/delete/context), no elision. | Fullscreen has enough space; user wants to see everything clearly |
| Post-close state | Stay collapsed (10 lines). | "Fullscreen review → back to approval" mental model; avoids choice occlusion |
| Multiple blocks | All expandable blocks shown as sections in one viewer. | Consistent with current "expand all" behavior; simpler than block selection |
| Props design | Viewer accepts pre-computed `FileViewerSection[]`, not raw `DisplayBlock`. | Decouples viewer from block internals; adapter logic stays in approval panel layer |
| Footer hint | Change from toggle (`expand`/`collapse`) to fixed action (`ctrl+e view`). | Ctrl-E is no longer a toggle |
