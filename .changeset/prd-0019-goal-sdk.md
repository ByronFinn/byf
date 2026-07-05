---
'@byfriends/agent-core': patch
'@byfriends/sdk': patch
---

新增 goal 的 SDK 入口：Session.createGoal/getGoal/pauseGoal/resumeGoal/cancelGoal 5 方法，经 RPC 转发到 agent-core 的 Agent.goal.*。createGoal 支持 objective + replace + budget 选项；终态由模型经工具决定（无 updateGoal）；budget 经 CreateGoal 工具或 slash flag 设置（无 setGoalBudget）。GoalSnapshot/GoalStatus/GoalBudgetLimits/GoalChange/GoalUpdatedEvent 从 SDK 重新导出，宿主可订阅 goal.updated 事件流。
