---
'@byfriends/cli': patch
'@byfriends/sdk': patch
'@byfriends/agent-core': patch
'@byfriends/kosong': patch
'@byfriends/kaos': patch
'@byfriends/oauth': patch
'@byfriends/vis-server': patch
---

清理全仓可选属性类型签名中的冗余 `| undefined`，将条件展开改为直接传值。删除已失效的 Nix 打包配置和旧构建辅助脚本。
