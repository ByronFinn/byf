---
'@byfriends/cli': patch
'@byfriends/vis-server': patch
'@byfriends/agent-core': patch
'@byfriends/kaos': patch
'@byfriends/kosong': patch
'@byfriends/sdk': patch
'@byfriends/oauth': patch
---

ci(release): standardize the publish pipeline and guard against workspace:/catalog: leaks

手动 `npm publish` 不会改写 `workspace:`/`catalog:` 协议,会把它们原样发到
npm registry,导致 npm 用户安装时报 `EUNSUPPORTEDPROTOCOL`。本次统一发布与校验
流程,从工具链层面杜绝此类回归:

- 新增 `scripts/check-published-manifest.mjs`:对每个非私有工作区包 `pnpm pack`,
  解压后检查 `dependencies`/`peerDependencies`/`optionalDependencies` 是否残留
  `workspace:` 或 `catalog:`,有即失败。已接入 `pnpm run publish` 流水线和
  `make pubcheck`。
- `scripts/attw-pkg.mjs` 的包发现逻辑从写死的 `packages/*` 改为遍历全部发布包,
  `@byfriends/cli`、`@byfriends/vis-server` 现在也被类型导出校验覆盖;纯 bin 应用
  (无 exports/main)会被自动跳过。
- 新增 `.github/workflows/release-npm.yml`:用 changesets/action 的全自动模式,
  合并 Version Packages PR 后自动发布到 npm 并打 tag,衔接到现有的二进制 release
  流程。CI 中同样运行上述预发布校验。
- 统一 `publishConfig.provenance: false`(agent-core/kosong/kaos/oauth 对齐已有设置)。
- `@byfriends/cli` 的 `zod` 依赖改用 `catalog:`,与其余包一致。
- 新增 `docs/agents/releasing.md` 记录标准发布流程、根因说明和紧急手动发布步骤。

注意:provenance 与 zod 声明方式的改动不改变运行时行为或公共 API,仅统一发布元数据。
