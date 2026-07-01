---
'@byfriends/agent-core': patch
---

refactor(prompt): tighten default system prompt for higher signal

The default agent system prompt (`profile/default/system.md`) carried a
few low-signal or contradictory passages. Tightened per Anthropic's
"context engineering" guidance (right altitude, minimal high-signal
token set, clear tool-selection):

- **Removed the `# Protocol` section.** It restated the
  `<system-reminder>` override rule already declared in
  `# Instruction Precedence`, and its `<system>` tag note had low ROI.
  The useful bits (system-reminders are authoritative and unrelated to
  the message they appear in; `<system>` is background) were folded
  into `# Instruction Precedence`.
- **Strengthened `# Tool Use`.** Added guidance to prefer built-in
  tools (Read/Write/Edit/Grep/Glob) over equivalent Bash commands and
  to batch independent tool calls in one turn. The "prefer built-in
  tools" rule previously lived only inside the Windows conditional
  block, gated by platform; it is now global.
- **Fixed a `# Safety` wording conflict.** "Stay within the working
  directory" contradicted the `Additional Directories` workspace
  feature; it now reads "within the working directory (and any
  additional workspace directories)".
- **Trimmed the Windows block** to drop the now-duplicated
  built-in-tools sentence, keeping only platform-specific guidance.

No cache-boundary headers (`# Project Information` / `# Working
Environment` / `# Skills`) moved, so the 4-block cache architecture
(ADR 0013) is unaffected. No public API or behavior-semantics change.
