# 发布流程(releasing)

本仓库是一个 pnpm monorepo,发布到 npm registry 与 GitHub Release。本文档描述标准发布路径、背后的原因,以及紧急手动发布的步骤,供人类维护者和 AI agent 共同参考。

## 为什么必须用 pnpm 发布,而不是 npm

工作区内,包与包之间的依赖用 pnpm 独有的协议声明:

- `workspace:^` —— 指向工作区内的另一个包。
- `catalog:` —— 指向 `pnpm-workspace.yaml` 的 `catalog` 表里登记的版本。

这两种协议**只有 pnpm 认识**。npm 不认识。

- `pnpm publish`(以及 `changeset publish`,它内部调用 `pnpm publish`)在打包前会把 `workspace:^` / `catalog:` **改写成真实版本号**,同时展开 `publishConfig`(例如把开发期指向 `.ts` 源码的 `exports` 重写为发布期的 `dist/*.mjs`)。发布出去的 manifest 是干净的具体版本。
- `npm publish` **原样**打包 manifest,既不改写协议,也不展开 `publishConfig`。结果就是 `workspace:^` 被直接发到 npm registry。用户用 `npm install` 安装时,npm 看到 `workspace:^` 这个不认识的协议,立即报 `EUNSUPPORTEDPROTOCOL`,安装失败。

这就是为什么本仓库**禁止用 `npm publish` 发包**。

## 标准发布路径(手动触发 CI)

发布由 `.github/workflows/release-npm.yml` 驱动,**手动触发**:

1. **积累 changeset**:每个影响发布产物的 PR 都附带一个 `.changeset/*.md` 文件(`pnpm changeset` 或 `make changeset` 生成)。这些 PR 正常合并到 `main`。
2. **手动触发发布**:当准备发版时,维护者在 GitHub Actions 页面对 `Release (npm)` workflow 执行 **Run workflow**。一次运行同时完成版本 bump 和发布:
   - 运行完整质量门禁与预发布校验。
   - `changeset version` 消费待发的 changeset,bump 版本号、更新各包 CHANGELOG。
   - 若有改动,把版本号改动 commit 并 push 回 `main`(用内置 `GITHUB_TOKEN`)。
   - `changeset publish` 把变更的包发到 npm,并为每个包打 `@byfriends/<pkg>@<ver>` 的 tag。
   - 若没有待消费的 changeset,运行会安全结束(无版本可发)。
3. **构建二进制**:`@byfriends/cli@*` 这个 tag 会触发现有的 `.github/workflows/release.yml`,在 macOS 和 Linux 上构建 SEA 原生二进制并创建 GitHub Release(附带 `install.sh`)。两个 workflow 通过这个 tag 自然衔接,无需手动协调。

> **关键**:不要在本地手动跑 `npm publish` 或 `pnpm publish` 来发版。在 Actions 页面手动触发 `Release (npm)` 即可,CI 会完成 version + publish。

## 本地预校验

在开发布 PR 之前,可以在本地验证发布产物的正确性:

```sh
make pubcheck
```

它依次运行:

- `publint` —— 检查每个包的发布布局(files、exports、bin 等)。
- `attw`(`scripts/attw-pkg.mjs`)—— 用 `pnpm pack` 展开 `publishConfig` 后,校验类型导出能正确解析。覆盖所有发布包(纯 bin 应用如 `@byfriends/cli` 因无库入口会被自动跳过)。
- `scripts/check-published-manifest.mjs` —— 对每个非私有包 `pnpm pack`,解压后检查 `dependencies` / `peerDependencies` / `optionalDependencies` 里是否残留 `workspace:` 或 `catalog:`。有残留即失败。

也可以单独运行:`pnpm run pubcheck:manifest`。

## 验证已发布产物(故障排查)

如果怀疑某个已发布版本有问题,可以用同样的方式本地复现检查:

```sh
# 在某个包目录下打包(会展开 publishConfig,与真实发布一致)
cd packages/agent-core
pnpm pack --pack-destination /tmp/byf-check

# 解压后查看真实的 package.json
cd /tmp/byf-check
tar -xzf byfriends-agent-core-*.tgz
cat package/package.json | grep -E 'workspace:|catalog:'
# 期望:无输出(说明已正确改写)
```

如果这里 grep 到了 `workspace:` 或 `catalog:`,说明该版本是用 `npm publish` 错误发布的,需要 `npm unpublish` 或发一个修正版。

## 紧急手动发布(非常规)

仅在 CI 不可用时才考虑手动发布,且**必须**走 pnpm:

```sh
make release   # = make version && make publish
```

`make publish` 会跑完整质量门禁(typecheck / lint / fmt / sherif / test / build / lint:pkg / manifest 检查),最后执行 `changeset publish`。

**绝对不要**用裸 `npm publish` 替代上述命令。
