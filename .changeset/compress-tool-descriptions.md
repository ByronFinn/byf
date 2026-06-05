---
"@byfriends/agent-core": patch
---

Compress Bash, Agent, and Grep tool descriptions as part of the context-minimization initiative (PRD #77).

- **Bash**: Removed command catalog, efficiency guidelines, and full safety guide from the tool description; retained the two safety anchor sentences and background-task semantics. Moved global instructions to the system prompt.
- **Agent**: Reduced description to the core 4-sentence contract (zero-context start, resume preference, result visibility, no-repeat rule). `buildSubagentDescriptions` no longer emits per-type tool lists.
- **Grep**: Removed the "use Grep instead of shell grep" rationale (now in system prompt); kept ripgrep-syntax tips, hidden-file notes, and sensitive-file filtering guidance.
- **System prompt**: Added a new "Tool Efficiency Guidelines" section containing the Bash command catalog, chaining/redirection tips, and the Grep tool-preference rule.
