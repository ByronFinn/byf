---
'@byfriends/cli': patch
---

Fix /agent page: approval no longer force-dismisses fullscreen, and Output pane no longer overflows

Two fixes for the `/agent` fullscreen page:

**Approval now shows as overlay when fullscreen is active**

Previously `showApprovalPanel` / `showQuestionDialog` would call
`dismissFullscreenControllers()` to force-close the agent page before
mounting the dialog into the editor — losing the user's place.  Now when
the agent page (or tasks browser) is open the approval / question dialog
is rendered as a pi-tui overlay on top of the fullscreen.  Input is
captured by the overlay while the fullscreen stays intact underneath, and
closing the overlay returns focus to the fullscreen.  In normal mode
(no fullscreen) the existing editor-replacement path is unchanged.

**Output pane no longer overflows its frame**

The Output preview pane in the sub-agent list constructs `toolOutputs`
by joining up-to-3 output lines with `\n`.  `renderPreviewFrame` pushed
each joined string as a single visual line, so the embedded newlines
broke through the frame border and corrupted the layout.  The renderer
now splits each `toolOutput` on `\n` so every visual line stays inside
the frame — fixing the overflow and the associated flicker/duplicate-page
artifacts that occurred when switching between sub-agents.
