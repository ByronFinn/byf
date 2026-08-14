---
'@byfriends/cli': minor
'@byfriends/agent-core': minor
---

权限层升级为资源感知：读取敏感文件（.env、SSH 私钥、credentials）改为审批事件（manual/yolo 点名文件审批，写保持硬拒）；会话审批生成 per-prefix 规则（批准 git push 后 git log 仍需审批）；复合命令按子命令逐条过权限规则。新增 CompleteTask 工具声明任务完成（调用 CompleteTask 结束当前回合）；重复调用同一工具 12 次后强制停止；MCP 工具超过 20 个时改为按需加载（用 McpTools 列出和加载）。
