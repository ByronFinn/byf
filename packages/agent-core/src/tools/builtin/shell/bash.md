Execute a `{{ SHELL_NAME }}` command. Use this for shell semantics — pipes, env, processes, git, package managers, build/test runners, anything genuinely interactive or multi-step.

**Translate these to a dedicated tool instead:**

- `cat` / `head` / `tail` (known path) → `Read`
- `sed` / `awk` (in-place edit) → `Edit`
- `echo > file` / `cat <<EOF` → `Write`
- `find` / recursive `ls` to locate files by name pattern → `Glob` (plain `ls <known-directory>` is fine for listing a directory)
- `grep` / `rg` (search file contents) → `Grep`
- `echo` / `printf` (talk to the user) → just output text directly

**Output:**
The stdout and stderr will be combined and returned as a string. The output may be truncated if it is too long. If the command failed, the output will end with a `Command failed with exit code: N` line stating the non-zero exit code.

Each shell call runs in a fresh shell environment. The shell variables, current working directory changes, and the shell history is not preserved between calls.

Never run commands that require superuser privileges unless explicitly instructed to do so.

If `run_in_background=true`, the command will be started as a background task and this tool will return a task ID instead of waiting for command completion. When doing that, you must provide a short `description`. Background commands default to a {{ DEFAULT_BACKGROUND_TIMEOUT_S }}s timeout and `timeout` is capped at {{ MAX_BACKGROUND_TIMEOUT_S }}s; set `disable_timeout=true` only when the task should run without a timeout. You will be automatically notified when the task completes. Use `TaskOutput` for a non-blocking status/output snapshot, and only set `block=true` when you explicitly want to wait for completion. Use `TaskStop` only if the task must be cancelled. If a human user wants to inspect background tasks themselves, point them to the `/tasks` command, which opens an interactive panel; it has no subcommands.
