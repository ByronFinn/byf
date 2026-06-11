---
"byf": minor
---

feat: remove 1000-step default limit per turn

Turns now run without a step limit unless `loop_control.max_steps_per_turn` is explicitly configured. Previously the default was 1000 steps.
