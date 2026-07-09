---
'@byfriends/cli': minor
'@byfriends/sdk': minor
'@byfriends/agent-core': minor
'@byfriends/kosong': minor
'@byfriends/kaos': minor
'@byfriends/oauth': minor
'@byfriends/vis-server': minor
---

**BREAKING:** 全量切换至 Bun 工具链（0.x minor，非 1.0 major）。

- 库包仅支持在 Bun 中 import/运行，不再支持 Node 解释执行。
- CLI 改为 compile 原生二进制分发（GitHub Release + npm 分平台 optionalDependencies）；Node SEA 与旧 npm-global JS（`dist/main.mjs`）路径废弃。
- 贡献与 CI 仅支持 Bun >=1.3.14；pnpm 不再是官方开发工具链。

旧 CLI 全局 JS 安装请重装：`npm uninstall -g @byfriends/cli && npm install -g @byfriends/cli`，或 `curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh | bash`。
