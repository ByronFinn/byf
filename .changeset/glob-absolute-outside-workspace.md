---
'@byfriends/agent-core': minor
---

feat: allow Glob to search explicit absolute paths outside the workspace

Glob's `path` argument previously enforced a `strict` policy that rejected any
absolute path outside the workspace roots. It now uses the
`absolute-outside-allowed` policy, matching Grep, so explicit absolute paths
outside the workspace are searched. Relative paths that escape the workspace
are still rejected.

- `GlobTool` path validation switched from `strict` to `absolute-outside-allowed` (parity with Grep)
- Sensitive files (`.env`, `id_rsa`, `.aws/credentials`, ...) are now filtered out of the result set via `isSensitiveFile`, mirroring Grep's `filterSensitiveLines`. A trailing "Filtered N sensitive file(s)" notice lists the relativized paths; when every hit is sensitive the empty result reads "No non-sensitive matches found". Because Glob runs `auto_allow` and now accepts arbitrary absolute roots, withholding sensitive directory structure is worth doing even though Glob only ever returns paths (never contents — Read's `checkSensitive` still blocks reading secrets).
- Pure-wildcard rejection message reworded from "Allowed roots for explicit path searches" to "Workspace roots" since outside paths are now permitted.
- `path` field JSON Schema description updated to document the new behavior.
- Header doc now records the sensitive-file filter and the symlink trust boundary.
