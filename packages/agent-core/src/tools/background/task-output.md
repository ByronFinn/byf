Retrieve output from a running or completed background task.

Use this after `Bash(run_in_background=true)` when you need to inspect progress or wait for completion.

Guidelines:
- Prefer automatic completion notifications. Use this tool only when you need output before it arrives.
- Non-blocking by default; returns a current status/output snapshot.
- Use block=true only when you want to wait for completion or timeout.
- Returns structured task metadata, a fixed-size output preview, and an output_path for the full log.
- For terminal tasks, metadata includes why it ended: `timed_out` (agent deadline abort) or `stop_reason` (explicit stop), plus a categorical `terminal_reason`.
- The full log is always available at output_path; use `Read` with that path to page through it.
- Output preview may be truncated; use `Read` with output_path to view the full log.
