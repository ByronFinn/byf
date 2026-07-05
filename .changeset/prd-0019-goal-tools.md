---
'@byfriends/agent-core': patch
---

新增 4 个 goal 工具（CreateGoal / GetGoal / SetGoalBudget / UpdateGoal），让模型经工具发起 goal 与判定终态。工具仅在 main agent 注册（sub/independent 不注册）；loopTools 在无 goal 时隐藏 SetGoalBudget/UpdateGoal，CreateGoal/GetGoal 始终可见。UpdateGoal 返回普通 success（不设 stopTurn），driver 在 turn 边界读 status 停止续跑。本切片不含 SDK 暴露与 CLI slash 命令。
