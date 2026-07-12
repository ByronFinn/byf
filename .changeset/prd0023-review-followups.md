---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

print 等待或列举后台任务失败时改为非零退出；全量压缩在去图后仍因请求体过大时按比例收缩历史重试；拒绝非有限 `createdAt` 的 cron 任务。
