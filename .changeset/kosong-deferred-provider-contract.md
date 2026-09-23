---
'@byfriends/kosong': patch
'@byfriends/agent-core': patch
---

provider 层为"可先挂起、稍后再取结果"的请求补齐了契约:这类请求返回专门的收尾状态并带回一个取结果用的句柄。目前只有尚未接入装配层的 harness 路径使用它,CLI 与网页用户暂不会感知到行为变化。
