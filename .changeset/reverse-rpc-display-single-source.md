---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
'@byfriends/sdk': patch
'@byfriends/web-server': patch
---

工具调用与审批的展示结构改为单一来源定义。此前终端、网页与引擎各自维护一份，三者都带兜底分支，新增一类展示块时不会有任何一方报错，只会在界面上静默降级成空白或错乱的内容。
