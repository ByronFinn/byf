# ADR 0008: Remove Plan Mode

## Status

Accepted

## Context

Plan mode was inherited from the upstream Kimi Code codebase as a planning state where the agent enters a read-only investigation phase before implementation, writes a plan artifact, and presents it to the user for approval via `ExitPlanMode`.

During a comprehensive context-minimization review, we evaluated whether plan mode provides enough value to justify its complexity footprint:

- **Token cost**: `EnterPlanMode` (~572t) + `ExitPlanMode` (~853t) tool descriptions consumed ~1,425 tokens per tool set. `PlanModeInjector` injected periodic reminders (300-800 chars each) into the context.
- **TUI complexity**: ~30+ references across the CLI/TUI layer (`/plan` slash command, Shift+Tab shortcut, plan card rendering, approval panel, footer badge).
- **Architecture spread**: Plan mode touched agent-core (state machine, permission policies, injection system), node-sdk (RPC passthrough), CLI (TUI state), vis (wire record rendering), and wire records (`plan_mode.*` event types).
- **Usage**: The planning behavior can be achieved by the agent using its existing `Read`/`Grep`/`Glob` tools followed by the `TodoList` tool to organize its approach, without a dedicated mode.

The team concluded that plan mode is a premature abstraction: it forces a binary state (planning vs. executing) when the agent should fluidly interleave exploration and action. The user can always ask the agent to "make a plan first" via natural language, which achieves the same outcome without the architectural overhead.

## Decision

Remove plan mode entirely. This includes:

- `EnterPlanMode` and `ExitPlanMode` tools
- `PlanMode` class in `agent-core`
- `PlanModeInjector` in the injection system
- `PlanModeGuardPermissionPolicy` and related permission policies
- Plan mode wire record types (`plan_mode.enter` / `cancel` / `exit`)
- TUI components: `PlanBoxComponent`, `/plan` command, Shift+Tab shortcut, footer badge, plan card rendering
- vis plan mode projection and issue detection
- CLI `--plan` flag and related option handling
- SDK `planMode` passthrough

Wire records from existing sessions containing `plan_mode.*` events must be handled gracefully during replay — the replay system will skip these records rather than crash.

## Consequences

- **Positive**: Removes ~73 files of code, significantly reducing maintenance burden and TUI complexity.
- **Positive**: Saves ~1,425 tokens of tool definition overhead plus ongoing injection costs.
- **Positive**: Simplifies the agent's mental model for users — no special mode to learn.
- **Negative**: Breaking change. Existing user configs referencing `planMode` or CLI `--plan` will fail. This requires a major version bump.
- **Negative**: Users who actively used `/plan` for structured planning will need to use natural language prompts instead.
- **Negative**: Old session wire records with `plan_mode.*` events require replay compatibility handling.
