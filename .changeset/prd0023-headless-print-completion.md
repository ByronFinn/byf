---
'@byfriends/cli': minor
'@byfriends/sdk': minor
'@byfriends/agent-core': minor
---

print 模式完成判定支持 goal hold、后台 drain 与 headless 防挂死；支持 `byf -p "/goal …"`，按 complete/blocked/paused 退出 0/3/6。注意：会话内有未来 fire 的周期 cron 时 `-p` 会保持进程不退出。
