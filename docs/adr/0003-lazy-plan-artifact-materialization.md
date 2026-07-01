# Plan 模式下延迟的 plan artifact 物化

我们决定，进入 Plan Mode 绝不能触碰文件系统：不创建 plan 目录，不创建空 plan 文件。出于用户体验和工作流连续性的考虑，进入时仍然创建一个稳定的内存中的 `planId` 和目标路径，但物化仅在首次对 plan 路径进行 Write/Edit 时发生（`clearPlan` 在文件不存在时仍然是空操作）。这防止了频繁进入/退出切换产生垃圾 plan artifact，同时保留 Plan Mode 状态语义和审批流程。
