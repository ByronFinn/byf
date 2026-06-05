Find files (and optionally directories) by glob pattern, sorted by modification time (most recent first).

Good patterns:
- `*.ts` — files in the current directory matching an extension
- `src/**/*.ts` — recursive with a subdirectory anchor and extension
- `test_*.py` — files whose name starts with a literal prefix

Rejected patterns (no literal anchor):
- `**`, `**/*`, `*/*` — pure wildcards. Add an extension or subdirectory to give the walk a concrete target.
- Anything starting with `**/` (e.g. `**/*.md`, `**/main/*.py`). Anchor it with a top-level subdirectory like `src/**/*.md`.
- `*.{ts,tsx}` — brace expansion is not supported. Issue two calls: `*.ts` and `*.tsx`.

Large-directory warning — avoid recursing into dependency/build output even with an anchor:
- `node_modules/**/*.js`, `.venv/**/*.py`, `__pycache__/**`, `target/**` match technically but typically produce thousands of results that truncate at the match cap. Prefer specific subpaths like `node_modules/react/src/**/*.js`.
