---
'@byfriends/cli': minor
---

Foreground sub-agent live viewer: `/agent` command with full-screen list and real-time activity viewer

Add the ability to inspect foreground sub-agents during and after execution:

- **`/agent` command** — new slash command to open the foreground sub-agent list
- **SubagentsListApp** — full-screen list showing all foreground sub-agents (running + completed) with agent name, description, phase, tool count, tokens, and elapsed time; 1-second polling for live updates; `Enter` to drill into the live viewer
- **SubagentLiveViewer** — full-screen scrollable viewer that renders the complete tool-call sequence (not truncated to 4 rows), sub-agent text output, and conditionally-visible thinking stream; real-time updates via `setSnapshotListener` with follow-tail when scrolled to bottom; vim-style scrolling (`j`/`k`/`g`/`G`/`PgUp`/`PgDn`); `t` to toggle thinking visibility
- **Card hint** — running sub-agent cards show `· /agent to inspect` so the viewer is discoverable
- **Sub-agent activity detail API** — `ToolCallComponent.getSubagentActivityDetail()` exposes the full ordered activity trail for consumption by the live viewer
- **Group support** — `AgentGroupComponent.getSubagentEntries()` getter enables locating ToolCallComponents inside groups for the list layer
- **Frame alignment fix** — `SubagentsListApp` and `SubagentLiveViewer` now use `@earendil-works/pi-tui`'s ANSI-aware width helpers, preventing colored text from shifting frame borders
- **Render loop fix** — `SubagentsController` now requests a TUI re-render after every poll update and live-viewer snapshot update, so the list/viewer refresh and keyboard input keep working instead of appearing frozen
- **Selection-change refresh** — moving the selection with ↑/↓ (or `j`/`k`) immediately refreshes the Detail and Output panes instead of waiting for the next poll tick
- **Tool status accuracy** — the Detail pane now distinguishes ongoing (`… Name`), done (`• Name`) and failed (`✗ Name`) sub-tools, so active tools are no longer misreported as done
- **Output preview stream** — the Output pane now shows the real-time sub-tool activity stream while the sub-agent is running, instead of staying blank until tools finish
- **Streaming render throttle** — the live viewer now coalesces high-frequency snapshot callbacks (one per streamed token) into a single render every 80ms, preventing the terminal diff renderer from being overwhelmed by full-trail redraws on every delta (which froze the UI and garbled the layout). Mirrors the throttle approach used by `AgentGroupComponent`
- **Control-character sanitization** — streamed sub-agent text, tool output, error text, and preview activity lines are now stripped of raw C0 control characters (`\r`, `\b`, `\x07`, vertical tab, form feed, …) that moved the cursor and produced the "one character per line" garble; `\t` is expanded to spaces for stable alignment
- **Soft-wrap instead of truncation** — long viewer body lines now wrap across rows (`wrapTextWithAnsi`) instead of being hard-truncated with an ellipsis, so streamed content stays fully readable at any terminal width

New files:
- `apps/cli/src/tui/components/dialogs/subagents/controller.ts`
- `apps/cli/src/tui/components/dialogs/subagents/list-app.ts`
- `apps/cli/src/tui/components/dialogs/subagents/live-viewer.ts`
- `apps/cli/src/tui/utils/sanitize-text.ts`

Test files:
- `apps/cli/test/tui/subagents-controller.test.ts`
- `apps/cli/test/tui/subagents-list-app.test.ts`
- `apps/cli/test/tui/subagent-live-viewer.test.ts`
- `apps/cli/test/tui/components/messages/agent-group.test.ts`
