---
'@byfriends/cli': patch
---

修复 byf 的 JS 构建产物无法用 bun 直接运行的问题（此前 dev:prod 一启动即崩）：构建目标误用 node，把仅适用于 Node 的兼容层打进了产物。
