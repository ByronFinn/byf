---
'@byfriends/cli': patch
---

Fix keyboard input becoming unresponsive on the /agent page when a sub-agent triggers a tool approval

When the `/agent` fullscreen page was open and a sub-agent triggered a tool that required approval (or asked a question), `showApprovalPanel` / `showQuestionDialog` would call `mountEditorReplacement`, which changed `TUI.focusedComponent` to the approval panel — but the approval panel was not in the TUI render tree (the fullscreen component had replaced all children). The user saw the agent page but all keypresses went to the invisible approval panel, which silently ignored `q`/`j`/`k`/`Esc`.

Fix: `showApprovalPanel` and `showQuestionDialog` now call `dismissFullscreenControllers()` before mounting the replacement panel, ensuring any active agent page or tasks browser fullscreen is closed and the normal layout is restored first.
