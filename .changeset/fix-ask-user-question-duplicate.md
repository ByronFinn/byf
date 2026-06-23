---
'@byfriends/cli': patch
---

fix: prevent duplicate AskUserQuestion Q/A rendering in transcript

`ToolCallComponent` constructor registered a snapshot listener before
building result content. Because `addSnapshotListener` invokes its
callback immediately, `buildContent()` ran once inside the callback and
again in the constructor's own build sequence, producing two copies of
each question-answer pair in the transcript.

The fix moves the snapshot listener registration to after all initial
build steps, so the immediate callback rebuilds the existing content
instead of racing with the constructor. Adds a unit test that verifies
each Q/A pair is rendered exactly once.
