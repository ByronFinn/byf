---
'@byfriends/agent-core': patch
---

新增 goal 续跑驱动与 ephemeral reminder 注入（agent-core）：active goal 在首个 turn 结束后自动连续发起 continuation turn，直到完成/阻塞/中断/超预算；reminder 走 before_user 临时注入，分 active/blocked/paused/complete 四档，不进 wire、不破坏缓存前缀。本切片为后续 goal 工具与 slash 命令奠基，暂无用户可见入口。
