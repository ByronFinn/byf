# ADR 0007: Silent Approval Transition — No Standalone Approval Notice

## Status

Accepted

## Context

When the user approves or rejects a tool execution (e.g., a Bash command), the TUI currently emits a standalone transcript notice:

```
Approved: run command
```

This notice has three problems:

1. **Information-poor.** The `action` field is a coarse label (`"run command"`) designed for approve-for-session matching, not for display. The actual command text is not shown.
2. **Redundant.** The ToolCall component already renders `• Using Bash (command)` → `• Used Bash (command)` with result output. The approval notice sits between these states and adds nothing.
3. **Visually weak.** A single-line `NoticeMessageComponent` with no icon, no color distinction between approved/rejected/cancelled.

Research into OpenAI Codex CLI shows it renders a rich standalone approval notice (`"✔ You approved codex to run <command> this time"`). Claude Code takes the opposite approach: no standalone notice at all — the ToolCall component transitions silently from in-progress to completed/rejected.

## Decision

Follow the Claude Code pattern: **remove the standalone approval notice entirely.** The ToolCall component already has all the data and visual machinery to express every outcome:

- **Approved:** `• Using Bash (command)` → `• Used Bash (command) · 12 lines` + output body
- **Rejected:** `✗ Rejected Bash (command)` (no body — the user chose this)
- **Cancelled:** `✗ Cancelled Bash (command)` (no body)
- **Execution failure:** `✗ Used Bash (command) · exit 1, 5 lines` + error output

To distinguish "approval rejected" from "execution failed" without string-matching the `output` text, we add a structured `blockedReason?: 'rejected' | 'cancelled'` field to the tool result pipeline:

```
PermissionManager (block: true, decision)
  → ExecutableToolErrorResult.blockedReason
    → ToolResultEvent.blockedReason
      → ToolResultBlockData.blockedReason
        → ToolCallComponent (header verb: Rejected / Cancelled)
```

### Bash chip

Add a chip renderer for the Bash tool showing output line count (success) or exit code + line count (failure):

- Success: `· 12 lines`
- Failure: `· exit 1, 5 lines`

Exit code is extracted from the result output text via regex (it is embedded by the Bash tool, not structured). This is acceptable because the chip is a cosmetic detail, not a control signal.

### Replay path

The replay path also emits approval_result notices. These are removed as well — replay has matching tool_call + tool_result records that render the same information via ToolCallComponent.

## Consequences

- **Positive:** Less visual noise. The conversation flow is tighter: command → execute → result, without an interjected notice that repeats information the ToolCall already shows.
- **Positive:** Structured `blockedReason` field is robust against text changes in the permission layer. No fragile string matching.
- **Negative:** In dense sessions with many tool calls, removing the approval notice makes it slightly harder to scan the transcript for "where did I approve/reject something." The `Rejected`/`Cancelled` verb in the ToolCall header partially compensates.
- **Negative:** `blockedReason` crosses the agent-core → SDK → CLI boundary. It is an optional field with a default of `undefined`, so existing consumers are unaffected.
