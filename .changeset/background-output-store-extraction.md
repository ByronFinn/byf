---
'@byfriends/cli': patch
'@byfriends/agent-core': patch
---

将后台任务的输出缓冲与磁盘读取职责从后台任务管理器中拆出为独立模块，降低该类的复杂度并便于后续维护。
