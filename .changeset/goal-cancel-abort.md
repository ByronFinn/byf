---
'@byfriends/cli': patch
---

修复 /goal cancel 只清除目标状态、未中断当前进行中的回合的问题。现在执行 cancel 会立即中止当前回合（与按 Esc 一致），不再让目标持续跑到自然结束。
