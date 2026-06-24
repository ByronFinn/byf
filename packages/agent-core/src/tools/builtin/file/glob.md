Find files (and optionally directories) by glob pattern, sorted by modification time (most recent first).

REJECTED patterns (no literal anchor — will be rejected):

- **Pure wildcards**: `**`, `**/*`, `*/*` — no literal anchor bounds the result. Add an extension or subdirectory to give the walk a concrete target.
- **`**/`prefix**: Anything starting with`**/`(e.g.`**/_.py`, `\*\*/main/_.ts`). The leading `**/`has no literal anchor in front of it. Anchor it with a top-level subdirectory like`src/**/\*.ts`.
- **Brace expansion**: `*.{ts,tsx}` is not supported. Split it into separate calls: `*.ts` and `*.tsx`.

Good patterns:

- `*.ts` — files in the current directory matching an extension
- `src/**/*.ts` — recursive with a subdirectory anchor and extension
- `test_*.py` — files whose name starts with a literal prefix

Large-directory warning — avoid recursing into dependency/build output even with an anchor:

- `node_modules/**/*.js`, `.venv/**/*.py`, `__pycache__/**`, `target/**` match technically but typically produce thousands of results that truncate at the match cap. Prefer specific subpaths like `node_modules/react/src/**/*.js`.

When you need to search the entire project, first use Glob to explore the top-level directory structure, then use an anchored pattern like `src/**/*.ts` or `packages/**/*.ts` to narrow the search.
