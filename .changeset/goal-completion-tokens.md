---
'@byfriends/agent-core': patch
'@byfriends/cli': patch
---

修复自动目标完成后完成卡片与 /goal status 显示 turns=0 tokens=0 的问题，覆盖两条路径：(1) goal 在续跑中被标记完成时，完成快照在记账本轮 token 之前就已发出，导致卡片读到的用量恒为 0；(2) 模型在首个 user turn 内就调 UpdateGoal(complete) 时，goal 续跑驱动从未接管（接管条件 status==='active' 不满足），首个 turn 不计入预算、complete 瞬态无人清空，completion 卡片与 /goal status 均显示 turns=0/tokens=0。
