# Goal Mode

Goal mode lets you hand a **verifiable, long-running** task to the agent and let it advance autonomously across turns — refactors, migrations, and batch fixes that naturally span multiple turns, without you pressing "continue" every round.

## When to use it

- A well-defined objective broken into multiple steps (e.g. "add unit tests to the `auth` module and push coverage above 80%").
- You want it to run until the model declares the goal complete, gets blocked, or hits a budget.
- You may need to pause, check progress, and resume along the way.

Goal mode is overkill for single-turn answers or open-ended exploration with no clear end state — use a normal conversation for those.

## Creating a goal

In an idle session:

```text
/goal Fill in the README install steps and verify every command
```

Once created:

- The goal becomes `active`; the footer shows a ▶ status badge plus a usage summary (turns / tokens / elapsed).
- When the current turn ends, a driver takes over and keeps advancing the goal across turns.
- Each continuation turn begins with an injected system reminder restating the objective and remaining budget, so the model keeps consistent context.

::: tip Tip
While a goal is advancing, only steer (append to the current turn) is allowed. To send a new message you must first pause or cancel the goal — this avoids user messages interleaving with continuation turns.
:::

## Goals with a budget

A budget sets a **hard cap** on the goal; when any dimension is exhausted the goal halts. The three dimensions may be combined freely; omitted dimensions stay unbounded:

```text
/goal --max-turns 10 <objective>           # at most 10 turns
/goal --max-tokens 50000 <objective>        # at most 50000 cumulative input+output tokens
/goal --max-seconds 600 <objective>         # at most 10 minutes of active wall-clock
/goal --max-turns 10 --max-tokens 50000 <objective>
```

- `--max-turns`: continuation turns (the first turn plus every continuation turn).
- `--max-tokens`: cumulative per-turn input+output tokens added by the driver.
- `--max-seconds`: wall-clock seconds accumulated while active; paused intervals do not count.

When the budget runs out, the goal automatically becomes `blocked` (badge turns ⚠). Use `/goal resume` to continue.

## Pause, resume, cancel

```text
/goal pause     # Soft-stop: the active turn finishes naturally, then the driver halts
/goal resume    # Resume a paused or blocked goal back to active
/goal cancel    # Hard-stop: abort the active turn (equivalent to Esc) and clear the goal
/goal status    # Print a one-line snapshot (objective, status, remaining budget) to the transcript
```

- **Pause** is a soft stop — it does not abort in-progress tool calls, preserving atomicity. It is available while streaming.
- **Cancel** is a hard stop — it aborts the active turn immediately; any half-finished tool-call state is yours to deal with.
- `pause`, `cancel`, and `status` are always available while streaming.

## Replacing a goal

When a goal already exists, creating a new one raises `GOAL_ALREADY_EXISTS`. Use `replace` to swap atomically (cancel the old goal + create the new one):

```text
/goal replace <new objective>
/goal replace --max-turns 5 <new objective>   # budget flags apply to the new goal
```

Replacement does not render a completion card — the old goal is discarded, not "completed".

## Completion

Only a model judgement of success (`UpdateGoal('complete')`) renders a completion card in the transcript, showing the objective, an optional reason, and the final usage. `cancel` does not render a card — only a low-presence marker.

## After resuming a session

If you restart the process and resume the same session with `byf --continue`, an active goal is automatically downgraded to `paused` (reason: `Paused after agent resume`). Use `/goal resume` to continue.

## Forking a session

A `/fork` session has **no goal** — fork always clears the goal (no badge, no reminder). To continue in the forked session, create a new goal.
