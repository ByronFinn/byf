---
"@byfriends/agent-core": patch
---

Compress Read, Glob, and remaining tool descriptions as part of the context-minimization initiative (PRD #77, Issue #79).

- **Read**: Removed "use Read instead of cat/head/tail", "use Glob/ls instead", and "use Grep instead" rationales (now in system prompt). Retained file size limits, binary handling, line_offset/n_lines pagination, sensitive file protection, and CRLF handling.
- **Glob**: Removed "use Glob instead of find/ls" rationale and verbose large-directory explanations. Retained good/rejected pattern examples and compressed large-directory warning.
- **Edit**: Removed Edit/Write distinction and "don't use sed" rules (now in system prompt). Retained old_string matching rules, parallel edit write-lock behavior, and CRLF/LF handling.
- **Write**: Removed "Use Edit for targeted changes" hint (now in system prompt). Retained overwrite/append distinction, parent-directory requirement, and LF/CRLF semantics.
- **AskUserQuestion**: Compressed Usage notes while retaining when-to-use/when-not-to-use guidance, multi_select, option label rules, and 1-4 question limit.
- **TodoList**: Compressed when-to-use/when-not-to-use sections. Retained Avoid churn rules, statuses, and title format requirements.
- **ReadMediaFile**: Compressed Tips paragraph. Retained parameter descriptions, size limit, return format, and coordinate rules.
- **TaskOutput/TaskList/TaskStop**: Compressed guidelines while retaining core functionality descriptions and key parameters.
- **System prompt**: Extended "Tool Efficiency Guidelines" with Read file-access rules and Edit/Write distinction rules.
