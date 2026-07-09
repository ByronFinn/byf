---
'@byfriends/vis-server': patch
---

HTTP 服务改为通过 Bun.serve 绑定，移除对 Node 适配器的依赖。
