---
'@byfriends/cli': minor
'@byfriends/sdk': patch
'@byfriends/agent-core': patch
---

无头模式（byf --print）此前无条件放行每一次工具调用、并把提问吞成空回答，既没有开关可以关闭，事后也查不到是谁放行的。现在默认沿用配置里的权限模式；新增 --yolo（等价 --approve-all）显式全放行、--deny-unapproved 显式拒绝；手动模式下的审批请求不再静默通过，而是以退出码 7 失败并在输出中说明原因。自动放行会写入会话记录，可事后审计。
