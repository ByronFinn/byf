---
'@byfriends/agent-core': patch
---

fix: yolo 模式下 Read/Grep/ReadMediaFile 在 workspace 外不再需要 approve

YoloOutsideWorkspacePermissionPolicy 原本对所有 FILE_ACCESS_TOOLS 中的
工具（Read/ReadMediaFile/Write/Edit/Grep）都做了 workspace 边界检查，
即使是已经是 auto_allow 的工具也会被升格为 ask。

但 auto_allow 的语义是"无需审批"，且 manual 模式下这些工具也不会因为
workspace 边界而被拦截。所以在 yolo 模式下对 auto_allow 工具做 workspace
边界检查造成了语义矛盾——yolo 模式比 manual 模式更严格。

修复：在策略中跳过 isDefaultAutoAllowTool() 为 true 的工具，使 Read、
ReadMediaFile、Grep 在 yolo 模式下真正免审，同时保留 Write/Edit 的
workspace 边界保护。

详见 analysis: packages/agent-core/src/agent/permission/policies/yolo-workspace-access.ts:22-30
