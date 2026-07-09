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
| （已删除）历史 residual `pnpm publish` | — | — |
| **裸 `npm publish` / `npm pack`** | **不改写** | **不展开** `exports` 等 |

- 裸 `npm publish` 会把 `workspace:^` 原样打进 registry。用户 `npm install` 时看到不认识的协议，立即报 `EUNSUPPORTEDPROTOCOL`，安装失败。
- 开发期 `exports` 常指向 `.ts` 源码；若不展开 `publishConfig`，发布面也会指向 tarball 里不存在的路径。

因此本仓库 **禁止用裸 `npm publish` 发包**。主路径以 **Bun 的 pack 改写 + pubcheck 硬门禁** 为准；changesets 不调用 Bun，故用 `with-publish-manifests` 做显式补洞（见 `docs/research/bun-publish-workspace-protocol-rewrite-1.md`）。

### 发布客户端与 `with-publish-manifests`

`#221` 已删除根 `packageManager: pnpm@…`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`。`@changesets/cli` 因此会落到 `npm publish`（不会调用 `bun publish`）。

**必须** 继续走 **`with-publish-manifests` + `changeset publish`**：在 publish 前改写 `workspace:` / `catalog:` 并展开 `publishConfig`，结束后恢复工作区 manifest。安装与 CI 主路径仍是 **Bun**；不要恢复 `pnpm/action-setup` 为安装主路径。

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
2. 调用 `changeset publish`（底层为 `npm publish`，不再 pin pnpm）。
3. **恢复** 工作区里的 `package.json`，使 monorepo 协议声明不被持久改写。

**绝对不要**用裸 `npm publish` 替代上述命令。单包紧急排查可用 `bun pm pack` 验 manifest，真正上传仍应走 `with-publish-manifests` 或 CI。

## 原生二进制（`bun build --compile`）

CLI 的 GitHub Release 资产由 `.github/workflows/release.yml` 产出，**官方路径是 `bun build --compile`**（PRD-0020 / #219–#221）。

### MVP 平台矩阵

| 目标三元组     | Bun `--target`     | CI runner      | `install.sh` |
| -------------- | ------------------ | -------------- | ------------ |
| `darwin-arm64` | `bun-darwin-arm64` | `macos-latest` | 支持         |
| `linux-x64`    | `bun-linux-x64`    | `ubuntu-latest`| 支持         |

其它平台（darwin-x64、linux-arm64、Windows 等）**deferred**，不在 Release 矩阵内；`install.sh` 会明确拒绝并提示。

### 本地 / CI 命令

```sh
# 在 monorepo 根或 apps/cli：
BYF_CODE_BUILD_TARGET=darwin-arm64 bun run --filter @byfriends/cli build:native:release
BYF_CODE_BUILD_TARGET=darwin-arm64 bun run --filter @byfriends/cli test:native:smoke
BYF_CODE_BUILD_TARGET=darwin-arm64 bun run --filter @byfriends/cli package:native
```

产物布局见 `apps/cli/scripts/compile/README.md`：

- `apps/cli/dist-native/bin/<target>/byf`
- `apps/cli/dist-native/artifacts/byf-<target>.zip` + `.sha256`

TUI 最小 smoke（R15 门禁，与 spike-0020 一致）：

```sh
test -x <byf-binary>
<byf-binary> --version
<byf-binary> --help
<byf-binary> export --help
BYF_CODE_NATIVE_ASSET_SMOKE=1 <byf-binary> --version
# 期望: Native asset smoke passed: <target>
```

### 签名策略（codesign / notarize）

| 场景 | 行为 |
| ---- | ---- |
| **本地 / CI 默认** | macOS 上 `codesign --sign -` **ad-hoc 签名**；写入 `byf.sha256`；`codesign -dv` 自检。不跑 Gatekeeper `spctl`。 |
| **Developer ID（可选）** | 设置 `APPLE_SIGNING_IDENTITY`（及可选 `APPLE_KEYCHAIN_PATH`）。脚本复用 `apps/cli/scripts/native/04-sign.mjs`：`--options runtime` + `entitlements.plist` + `--timestamp`。 |
| **公证 notarize** | **尚未接入 compile CI**。若需要分发「未隔离 / 无右键打开」体验，应在后续 workflow 中对 **compile 产物** 跑 `notarytool` + `stapler`，再以 `spctl -a -t install` 作为发布门禁（`05-verify.mjs` 的 `requireGatekeeper`）。ad-hoc 二进制无法通过 Gatekeeper 在线检查，这是预期。 |
| **linux-x64** | 无 codesign；仅产物 sha256（可执行文件 + zip）。 |

Node SEA / `postject` 管线已在 #221 从主路径删除；官方二进制仅 `bun build --compile`。

### 与 npm 的关系（主包 + 分平台 optionalDependencies，#220）

终端用户两条官方安装路径：

| 路径 | 产物 |
| ---- | ---- |
| GitHub Release | `install.sh` + `byf-<target>.zip`（compile 二进制） |
| `npm i -g @byfriends/cli` | 主包 JS launcher（`bin/byf.cjs`）+ 当前平台 optionalDep 原生二进制 |

#### 平台子包

| npm 包名 | 目标 | 目录 |
| -------- | ---- | ---- |
| `@byfriends/cli-darwin-arm64` | darwin-arm64 | `apps/cli/npm/darwin-arm64/` |
| `@byfriends/cli-linux-x64` | linux-x64 | `apps/cli/npm/linux-x64/` |

- 与 `@byfriends/cli` **版本对齐**（`.changeset/config.json` 的 `fixed` 组）。
- monorepo 内标记 `private: true`，避免 `changeset publish` 在二进制尚未就绪时发出空包。
- `package.json` 的 `os` / `cpu` 字段让 npm 只安装匹配平台。
- 二进制由 **与 Release 同源** 的 compile 产物拷贝进入：`bun run --filter @byfriends/cli package:npm-platforms`（`apps/cli/scripts/npm/package-platforms.mjs`），源路径 `dist-native/bin/<target>/byf`。

#### 发布顺序

1. **`release-npm.yml`**：`changeset version` + 发布 `@byfriends/cli`（及库包）。主包 `optionalDependencies` 指向对齐版本的平台包；平台包此时通常尚未在 registry 上（optional 安装失败不阻断）。
2. **`release.yml`**（由 `@byfriends/cli@*` tag 触发）：矩阵 compile → smoke → zip → **`package:npm-platforms`** → 上传 → GitHub Release → **清除 `private` 后 `npm publish` 各平台子包**。

因此「主包先于平台子包数分钟」的窗口内，用户若立刻 `npm i -g` 可能缺 optionalDep；`bin/byf.cjs` 与 postinstall 会给出可理解错误，并提示重装或走 `install.sh`。平台子包发布完成后重装即可。

#### 本地打包平台子包

```sh
BYF_CODE_BUILD_TARGET=darwin-arm64 bun run --filter @byfriends/cli build:native:release
BYF_CODE_BUILD_TARGET=darwin-arm64 bun run --filter @byfriends/cli package:npm-platforms
# 产物：apps/cli/npm/darwin-arm64/bin/byf（gitignored）
```

#### Launcher

`@byfriends/cli` 的 `bin.byf` 指向 `bin/byf.cjs`：解析当前平台的 optionalDep 包路径，再 `spawn` 原生 `byf`。错误平台 / 缺失 optionalDep 时打印重装与 GitHub Release 指引。运行时**不依赖 Bun**；Node 仅作为 npm 安装后的薄 trampoline。
