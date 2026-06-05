Read a text file from the local filesystem.

If the user provides a concrete file path to a text file, call Read directly. Prefer to read several files in parallel: emit multiple `Read` calls in a single response.

- Returns up to {{ MAX_LINES }} lines or {{ MAX_BYTES_KB }} KB per call, whichever comes first; lines longer than {{ MAX_LINE_LENGTH }} chars are truncated mid-line.
- Page larger files with `line_offset` (1-based start line) and `n_lines`. Omit `n_lines` to read up to the {{ MAX_LINES }}-line cap.
- Negative line_offset reads from the end of the file (for example, -100 reads the last 100 lines); the absolute value cannot exceed {{ MAX_LINES }}.
- Sensitive files (`.env`, credential stores, SSH keys, and similar secrets) are refused; do not attempt to read them.
- Only UTF-8 text files can be read. Non-UTF-8 encodings, binary files, and files containing NUL bytes are refused; use `ReadMediaFile` for images or video, and Bash or an MCP tool for other binary formats.
- Output format: `<line-number>\t<content>` per line.
- A `<system>...</system>` status block is appended after the file content; it summarizes how much was read and is not part of the file itself.
- Pure CRLF files are displayed with LF line endings; `Edit` matches this output and preserves CRLF when writing back.
- Mixed or lone carriage-return line endings are shown as `\r` and require exact `Edit.old_string` escapes.
- After a successful `Edit`/`Write`, do not re-read solely to prove the write landed. When the task depends on an exact file, API, or output shape, inspect the final external contract before finishing.
