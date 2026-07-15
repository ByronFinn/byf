---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

修复会话内批准一次 Cron 创建后会放行任意后续定时任务的问题：现在按完整创建内容分别授权。
