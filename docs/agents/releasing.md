# 发布流程（releasing）

本仓库是一个 **Bun monorepo**（ADR 0028 / PRD-0020），发布到 npm registry 与 GitHub Release。本文档描述标准发布路径、背后的原因，以及紧急手动发布的步骤，供人类维护者和 AI agent 共同参考。

## 为什么必须走会改写协议的发布路径，而不是裸 `npm publish`

工作区内，包与包之间的依赖用 monorepo 协议声明：

- `workspace:^` / `workspace:*` —— 指向工作区内的另一个包。
- `catalog:` —— 指向根 `package.json` 的 `catalog` 表里登记的版本。

这两种协议 **npm 不认识**。

| 路径 | `workspace:` / `catalog:` | `publishConfig`（如 `exports` → `dist/*`） |
| --- | --- | --- |
| **`bun pm pack` / `bun publish`** | 内置改写为具体 semver | Bun 1.3.x **不**合并 overlay 字段 |
| **`scripts/with-publish-manifests.mjs` + `changeset publish`** | 脚本显式改写（补洞） | 脚本显式展开 overlay（补洞） |
| 过渡期 residual `pnpm publish`（changesets 在检测到 pnpm 时） | pnpm 改写 | pnpm 展开 |
| **裸 `npm publish` / `npm pack`** | **不改写** | **不展开** `exports` 等 |

- 裸 `npm publish` 会把 `workspace:^` 原样打进 registry。用户 `npm install` 时看到不认识的协议，立即报 `EUNSUPPORTEDPROTOCOL`，安装失败。
- 开发期 `exports` 常指向 `.ts` 源码；若不展开 `publishConfig`，发布面也会指向 tarball 里不存在的路径。

因此本仓库 **禁止用裸 `npm publish` 发包**。主路径以 **Bun 的 pack 改写 + pubcheck 硬门禁** 为准；changesets 不调用 Bun，故用 `with-publish-manifests` 做显式补洞（见 `docs/research/bun-publish-workspace-protocol-rewrite-1.md`）。

### 过渡 pnpm 残留（有 deadline）

根 `package.json` 仍可能带有 residual `packageManager: pnpm@…`，工作区里也可能仍有 `pnpm-lock.yaml` / `pnpm-workspace.yaml`（仅过渡）。这会使 `@changesets/cli` 在 publish 时优先调用 `pnpm publish`（pnpm 也会改写协议并展开 `publishConfig`）。

**这些 residual 不是长期真相。** 它们在 PRD-0020 的 **breaking minor 发版收口**（#221 / #222）前删除；在此之前：

- 安装与 CI 主路径已是 **Bun**（不要恢复 `pnpm/action-setup` 为安装主路径）。
- 发布入口仍走 **`with-publish-manifests` + `changeset publish`**，不依赖「必须只能用 pnpm 发布」。
- 删除 residual 后，changesets 会落到 `npm publish`；此时 **必须** 继续经过 `with-publish-manifests`，否则协议与 `publishConfig` 会泄漏/错误。

## 标准发布路径（手动触发 CI）

发布由 `.github/workflows/release-npm.yml` 驱动，**手动触发**：

1. **积累 changeset**：每个影响发布产物的 PR 都附带一个 `.changeset/*.md` 文件（`bun run changeset` 或 `make changeset` 生成）。这些 PR 正常合并到 `main`。
2. **手动触发发布**：当准备发版时，维护者在 GitHub Actions 页面对 `Release (npm)` workflow 执行 **Run workflow**。一次运行同时完成版本 bump 和发布：
   - 用 Bun 安装依赖并运行完整质量门禁与预发布校验（含 `lint:pkg` 与 `pubcheck:manifest`）。
   - `changeset version` 消费待发的 changeset，bump 版本号、更新各包 CHANGELOG。
   - 若有改动，把版本号改动 commit 并 push 回 `main`（用内置 `GITHUB_TOKEN`）。
   - `bun scripts/with-publish-manifests.mjs bunx changeset publish` 把变更的包发到 npm，并为每个包打 `@byfriends/<pkg>@<ver>` 的 tag。
   - 若没有待消费的 changeset，运行会安全结束（无版本可发）。
3. **构建二进制**：`@byfriends/cli@*` 这个 tag 会触发现有的 `.github/workflows/release.yml`，构建原生二进制并创建 GitHub Release（附带 `install.sh`）。两个 workflow 通过这个 tag 自然衔接，无需手动协调。

> **关键**：不要在本地手动跑裸 `npm publish` 来发版。在 Actions 页面手动触发 `Release (npm)` 即可，CI 会完成 version + publish。

## 本地预校验（硬门禁）

在开发布 PR 之前，可以在本地验证发布产物的正确性：

```sh
make pubcheck
# 等价于：
bun run lint:pkg && bun run pubcheck:manifest
```

它依次运行：

- `publint`（`scripts/publint-pkg.mjs`）—— 用 `bun` pack 检查每个包的发布布局（files、exports、bin 等）。
- `attw`（`scripts/attw-pkg.mjs`）—— 用 `bun pm pack` 打包后 **手动展开 `publishConfig`**，再校验类型导出能正确解析。覆盖所有发布包（纯 bin 应用如 `@byfriends/cli` 因无库入口会被自动跳过）。
- `scripts/check-published-manifest.mjs` —— 对每个非私有包执行 **`bun pm pack`**，解压后检查 `dependencies` / `peerDependencies` / `optionalDependencies` 里是否残留 `workspace:` 或 `catalog:`。有残留即失败。

也可以单独运行：

```sh
bun run pubcheck:manifest
bun run lint:pkg
```

**`pubcheck:manifest` 是硬门禁**：CI 发布 job 与本地 `bun run publish` / `make publish` 都会跑它；不得跳过。

## 验证已发布产物（故障排查）

如果怀疑某个已发布版本有问题，可以用同样的方式本地复现检查：

```sh
# 在某个包目录下用 Bun 打包（内置改写 workspace:/catalog:）
cd packages/agent-core
bun pm pack --destination /tmp/byf-check --quiet

# 解压后查看真实的 package.json
cd /tmp/byf-check
tar -xzf byfriends-agent-core-*.tgz
# 协议不得泄漏：
grep -E 'workspace:|catalog:' package/package.json
# 期望: 无输出

# 注意：bun pm pack 不会合并 publishConfig.exports。
# 真实发布面以 with-publish-manifests / attw 展开后的 exports 为准（应指向 dist/*）。
```

如果这里 grep 到了 `workspace:` 或 `catalog:`，说明该版本未走会改写的 pack/publish 路径（例如裸 `npm publish`），需要 `npm unpublish` 或发一个修正版。

## 紧急手动发布（非常规）

仅在 CI 不可用时才考虑手动发布，且 **必须** 走仓库脚本（Bun + 补洞包装），不要手写 `npm publish`：

```sh
make release   # = make version && make publish
# 或：
bun run version
bun run publish
```

`make publish` / `bun run publish` 会跑完整质量门禁（typecheck / lint / fmt / sherif / test / build / lint:pkg / `pubcheck:manifest`），最后执行：

```sh
bun scripts/with-publish-manifests.mjs changeset publish
```

该包装会：

1. 对每个可发布包：把 `workspace:` / `catalog:` 改写成具体版本，并展开 `publishConfig` 中的 `exports` / `main` / …（保留 `access` / `provenance` 等给 publish 客户端）。
2. 调用 `changeset publish`（底层可能是 residual pnpm 或 npm）。
3. **恢复** 工作区里的 `package.json`，使 monorepo 协议声明不被持久改写。

**绝对不要**用裸 `npm publish` 替代上述命令。单包紧急排查可用 `bun pm pack` 验 manifest，真正上传仍应走 `with-publish-manifests` 或 CI。
