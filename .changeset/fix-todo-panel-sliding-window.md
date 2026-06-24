---
'@byfriends/cli': patch
---

fix: todo-panel sliding window keeps in_progress task visible

The collapsed TODO panel used a fixed `slice(0, 5)` that always showed the first five items regardless of which task was active. When `in_progress` appeared beyond the fifth position it was hidden behind the "+N more" fold.

The collapsed view now computes a dynamic window offset so that the `in_progress` item is always within the visible range. When the window slides past the beginning of the list, an "(N above)" hint is added; the "+N more" hint continues to reflect items hidden below. Edge cases (five or fewer items, no `in_progress`, last item active) are handled correctly.
