---
'@byfriends/agent-core': patch
---

fix(prompt): steer LLM to run_in_background instead of shell `&`

Long-running commands occasionally escaped the agent's task system: the
LLM backgrounded a process with shell `&` (or `nohup`/`disown`) inside
the Bash `command` string instead of setting `run_in_background: true`.
Such processes are never registered with `BackgroundProcessManager`, so
they are invisible to `/tasks`, cannot be inspected or stopped, and emit
no completion notification — the user sees "0 total" in the task browser
while the process keeps running as an orphan.

Root cause was prompt discoverability, not a code bug. A "context
minimization" refactor (`0a9bb30`) deleted the only persuasive guidance
("Prefer `run_in_background=true` for long-running builds, tests,
watchers, or servers") and claimed to relocate it to a system-prompt
"Tool Efficiency Guidelines" section that was never created. The
surviving parameter description was purely mechanical ("Whether to run
the command as a background task"), with nothing telling the LLM when to
prefer it and nothing prohibiting shell `&`. Shell `&` is the
higher-salience default in model training, so nothing overrode it.

Changes (text only, no execution-path or serialization change):

- **`tools/builtin/shell/bash.ts`** — the `run_in_background` parameter
  description now states when to use it (long-running builds, tests,
  servers, watchers, batch scripts) and that a process must not be
  detached with shell `&`/`nohup`/`disown` to work around it.
- **`tools/builtin/shell/bash.md`** — restored the preference guidance
  removed in `0a9bb30`, plus an explicit "never detach with `&` /
  `nohup` / `disown`" rule. The never-detach rule is worded as a
  standalone prohibition (it does NOT prescribe `run_in_background` as
  the remedy) so it stays correct in both background-enabled and
  background-disabled modes. Legitimate `&&` / `||` chaining and
  `cmd1 & cmd2` list separators are explicitly carved out.
  `withoutBackgroundDescription` swaps the preference bullet for a
  disable notice when background is off.
- **`profile/default/system.md`** — added a global `# Tool Use` rule
  directing long-running commands to `Bash(run_in_background=true)`,
  landing the "Tool Efficiency Guidelines" intent that `0a9bb30`
  intended but never implemented.

Test coverage: added assertions in `test/agent/tool.test.ts` pinning
the background-disabled description — it must contain the disable
notice, must not contain "Prefer `run_in_background=true`", and must
not contain any "Always use `run_in_background=true` instead"
prescription (which would contradict the disable notice). This guards
the `withoutBackgroundDescription` transform against future template
drift. Verified enabled and disabled modes render self-consistently.
