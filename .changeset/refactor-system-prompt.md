---
"@byfriends/agent-core": minor
---

Refactor default system prompt: remove content already covered by tool descriptions and derivable from first principles.

Removed redundant sections: tool efficiency guidelines (Bash command list, shell chaining, Grep/Read/Edit/Glob rules — all in respective tool descriptions), Agent delegation and Background Bash usage (in tool descriptions), coding/research workflow guidelines (derivable from First Principles), approval coordination (framework implementation detail), AGENTS.md rationale (human-oriented), and Ultimate Reminders (model-inherent behavior).

Consolidated into four clear sections: First Principles (meta-rule), Tool Use (when to use tools), Protocol (system tags), and Safety (all constraints in one place). Prompt reduced from 174 lines to ~80 lines with no functional loss.
