Perform exact string replacements against the text view returned by Read.

- You must Read the file in this conversation before editing it, or the call will fail.
- When copying from Read output, omit the line-number prefix and tab; match only the file content.
- By default, old_string must occur exactly once. If it matches multiple locations, add surrounding context or set replace_all when every occurrence should change.
- When making several independent changes, issue multiple Edit calls in parallel within a single response; edits to the same file are serialized automatically by a write lock.
- When several parallel Edit calls target the same file, a write lock serializes them; they apply in the order the calls appear in your response. An edit fails with `old_string not found` if its old_string was taken from text an earlier edit already replaced — base every old_string on the latest Read view and order dependent edits accordingly.
- For pure CRLF files, Read shows LF and Edit.old_string/new_string should use LF; Edit writes the file back with CRLF preserved.
- For mixed line endings or lone carriage returns, Read displays carriage returns as \r; include actual \r escapes in old_string/new_string for those positions.
