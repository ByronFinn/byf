# Agents and subagents

The agent in BYF is the core that drives a session. A session is always hosted by a single main agent, which may dispatch one or more subagents to handle more focused subtasks as the work progresses.

The main agent is responsible for understanding the user's overall intent, planning the steps, conversing with the user, calling tools, and finally aggregating the results. Its context spans the entire session, and it is the entity the user interacts with directly in the terminal.

A subagent is a temporary "assistant" spawned by the main agent. It takes a clearly defined task description, completes the work independently in its own context, and then returns the conclusion to the main agent. Subagents do not converse with the user directly, nor do they pollute the main agent's context history. This division of labor is particularly suited for work with clear boundaries that requires a lot of reading but produces a short output — such as "exploring a codebase", "reviewing a large implementation", or "planning a complex change".

## Built-in subagents

BYF ships with three built-in subagents, each targeting a different kind of task, ready to use out of the box:

- **`coder`**: The default subagent, a general software engineering assistant that can read and write files, run shell commands, search code, and land concrete changes.
- **`explore`**: Dedicated to codebase exploration. It operates read-only and will not modify any files. Suitable for quickly searching, reading, and summarizing a repository without making changes.
- **`plan`**: For implementation planning and architectural design. Its toolset is narrowed further — not even shell commands are provided — focusing on "thinking through how to do it" rather than "doing it".

## Invocation

Subagents are dispatched automatically by the main agent. The main agent decides when to dispatch one based on task complexity, context usage, and the independence of the subtask — you don't need to manually specify the timing.

Each dispatch surfaces as an approval request in the terminal (unless it matches an existing allow rule or you are in YOLO mode), so you can inspect the task description before it runs. You can also ask the main agent to prefer a particular type of subagent for a task — for example, "use `explore` first to map out the relevant files before making changes."

Subagents can also run in the background; their results are synthesized back to the main agent automatically on a later turn, with no manual polling needed. You can also resume an existing subagent instance to continue the same task.

## Context isolation and resource cost

Each subagent has a completely independent context window. It cannot see the main agent's conversation history; it can only see the task description that the main agent explicitly passed. The subagent's own intermediate thoughts and tool call records do not flow back to the main agent — only the final result appears in the main agent's context.

This isolation brings two direct benefits. First, the main agent's context stays concise and isn't flooded with exploratory logs over a long session. Second, multiple subagents can run in parallel without interfering with each other.

The cost is that each subagent independently consumes model tokens, so it is unnecessary to dispatch a subagent for simple tasks — letting the main agent handle them directly is more economical. Subagents also cannot dispatch further subagents.

## Permission inheritance

A subagent's permission rules are inherited from the main agent: "always allow" rules that the main agent has accepted via `/permission` or during an approval automatically cover every subagent it dispatches, so the subagent does not need to re-approve the same kind of tool call. The `Agent` tool itself is allowed by default, so the main agent can complete multiple delegations without interrupting the user.

If you want a particular kind of tool to be permanently unavailable inside subagents, you should tighten the main agent's permission rules.

## Storage location in the session directory

A subagent's runtime state is persisted to the session directory for later inspection and debugging. Each subagent instance corresponds to a separate subdirectory under `agents/`, which contains a `wire.jsonl` file recording prompts, message history, and final status in chronological order. Background subagents additionally expose their lifecycle through the `tasks/` subdirectory.

::: warning Note
Session directories, wire files, and task records are local debugging material and may contain user prompts, command output, repository paths, tool results, or traces of credentials. Do not commit these files to public repositories, issues, or chat transcripts directly; redact them first if you need to share them.
:::
