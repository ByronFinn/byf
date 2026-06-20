# Common use cases

Below are typical scenarios and prompt samples for BYF.

## Understanding an unfamiliar project

When taking over an unfamiliar repository, ask the agent to explore and produce a research summary before making changes:

```
Walk me through the overall architecture of this repository. Focus on:
1. Where the entry point is and what happens at startup
2. The dependency relationships between major modules
3. How configuration and data are loaded
At the end, draw a simple module relationship diagram.
```

For focused questions, ask directly:

```
How does the event loop under src/runtime work? Where do events originate, and who consumes them?
```

```
How is "permission approval" implemented in this project? Which files are involved, and what are the key types?
```

For large investigations, the main agent can spawn **subagents** to handle subtasks in parallel. See [Agents](../customization/agents.md).

## Implementing a new feature

State the requirement and acceptance criteria clearly. For complex or risky changes, ask the agent to propose a plan first.

```
Add a retry utility under src/utils:
- Function signature retry<T>(fn: () => Promise<T>, options): Promise<T>
- Supports three options: maxAttempts, initialDelayMs, backoffFactor
- Throws the last error on failure
- Add a set of unit tests covering success, success after retry, and full failure
```

Tell it how to change the result — no need to edit by hand:

```
The backoff uses a fixed value. I want some jitter added to avoid thundering herd. Update the code and the tests.
```

## Fixing bugs

State the symptom, reproduction conditions, and expected behavior:

```
Running npm test occasionally throws this error:

  TypeError: Cannot read properties of undefined (reading 'id')
      at SessionStore.update (src/session/store.ts:142:18)

It only appears in cases that trigger multiple updates concurrently. Locate the cause, fix it, and run the full test suite once at the end to confirm.
```

Not sure where the cause is? Have it investigate first:

```
User report: after a successful login, the first page refresh sends them back to the login page; refreshing again works fine. Investigate the possible causes first, list the most suspicious spots, and wait for me to confirm a direction before making any changes.
```

For mechanical tasks, just hand it off:

```
Run the tests, fix any failing cases, and run them again to confirm everything is green.
```

## Writing tests and refactoring

Tasks with clear boundaries and acceptance criteria are a great fit:

```
src/parser/markdown.ts currently has almost no tests. Add a set of unit tests covering plain paragraphs, nested lists, code blocks, tables, blockquotes, and mixed scenarios. Follow the existing test style in this project.
```

```
Extract the repeated "read body → validate → write log → return" logic under src/handlers into a middleware. Run the tests after the changes and make sure existing behavior is unchanged.
```

For multi-file refactors, ask the agent to propose a plan first. Use `/fork` to explore alternative approaches.

## One-off scripts and automation tasks

Bulk edits, statistics, and research can be done with a single prompt:

```
Change all var declarations in .js files under src/ to const or let, preferring const when possible. Run lint after the changes to confirm.
```

```
Analyze the access logs under logs/ for the past 7 days. Group by endpoint path and report the number of calls plus p50 and p99 response times. Output the result as a markdown table.
```

```
Research the mainstream dependency injection options in TypeScript (tsyringe, inversify, awilix). Compare them along three dimensions: API style, decorator dependencies, and runtime overhead. Give me a recommendation within one page.
```

Use `--yolo` or `/yolo` to skip approvals, or set an allow list under [permission configuration](../configuration/config-files.md#permission) for a safer middle ground.

## Generating and maintaining documentation

```
I just changed the interface signature of src/auth/login.ts. Update the corresponding JSDoc, the example code in the README, and any paragraph that mentions this interface under docs/en/guides.
```

```
For every public function under src/api that does not have a docstring, add one. Match the style of the existing comments.
```

```
Based on the command implementations under src/cli, generate a draft command reference listing each subcommand, its arguments, and default values. Put it under docs/en/reference for me to review later.
```

Archive or share a session with `byf export <sessionId>`.
