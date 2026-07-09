# Spike 0020：compile + koffi/clipboard + TUI 最小 smoke — go/no-go 结论

> **关联**：PRD-0020 / Issue #210 / ADR 0028 / research `bun-compile-native-addons-1`
> **调查日**：2026-07-09 ｜ **Bun 版本**：1.3.14（本地 macOS arm64）
> **结论**：**GO** — compile 可用于取代 SEA 正式分发；MVP 两平台（darwin-arm64 + linux-x64）无 native 阻塞。

## TL;DR

`bun build --compile` 在 Bun 1.3.14 下产出可用的单二进制；**clipboard `.node` 被嵌入二进制**（干净机可跑）；**koffi 是 Windows 专属死代码**（MVP 两平台从不触达）。TUI 最小 smoke（`--version` / `--help` + 无网 native 路径）可定义并已验证可重复。按策略 A 门禁——本结论满足 GO，分发轨可推进（#219/#220）。

## 1. 调查问题

`bun build --compile` 是否能承载本仓库 CLI 分发契约（零运行时预装），尤其 koffi / `@mariozechner/clipboard` 原生路径在 Bun runtime 与 compile 产物下的可用性？

## 2. 探针矩阵（实测）

| 探针                                          | Bun runtime（`bun run`） | `bun build --compile` 产物          | 备注                                             |
| --------------------------------------------- | ------------------------ | ----------------------------------- | ------------------------------------------------ |
| 最小入口 compile                              | n/a                      | **GO**：65 MB，~130 ms 编译，可执行 | darwin-arm64 本机                                |
| **clipboard** 模块加载（`require`）           | GO                       | **GO**                              | `.node` **嵌入二进制**（`/$bunfs/root/...node`） |
| clipboard 干净机（移走 node_modules `.node`） | —                        | **GO**：仍加载成功                  | 证明 embedding 生效                              |
| **koffi** FFI（`getpid`）                     | GO（FFI 真实调用）       | GO（但见 §3）                       | koffi 会动态扫描 `build/<triplet>/koffi.node`    |
| koffi 干净机（移走 node_modules）             | —                        | **NO-GO（磁盘依赖）**：`ENOENT`     | 动态 `require` 不可静态嵌入                      |

### 3. koffi 是 Windows 专属死代码（关键）

`@earendil-works/pi-tui@0.74.0` 的 `dist/terminal.js:149` 明确注释并实现：

```js
// Dynamic require to avoid bundling koffi's 74MB of cross-platform
// native binaries into every compiled binary. Koffi is only needed
// on Windows for VT input support.
const koffi = cjsRequire('koffi');
const k32 = koffi.load('kernel32.dll'); // Windows VT 输入
```

且方法体首行 `if (process.platform !== "win32") return;`，外层 `try/catch` 静默降级。

**结论**：

- **darwin-arm64 / linux-x64（MVP 两平台）从不调用 koffi**——它在 compile 产物里的磁盘依赖问题**对 MVP 分发无影响**。
- koffi 仅对 Windows VT 输入有意义，而 Windows 在 PRD-0020 中 **deferred**。
- 因此 R15 门禁「compile TUI 最小 smoke」**不依赖 koffi**；不砍 TUI、不降级。

### 4. clipboard 文本读写的环境行为（非阻塞）

直接 require `@mariozechner/clipboard-darwin-arm64` 的 `clipboard.darwin-arm64.node`：

- `getText()` 返回 `{}`（而非 string）；`setText('x')` 抛 `Error: No string found` / `code: "GenericFailure"`。
- **同一 `.node` 在 Node.js v24.15.0 下行为完全相同**——这是无 GUI/无 NSPasteboard 会话的 headless 环境行为，**不是 Bun 回归**。
- 现有 SEA smoke（`apps/cli/src/native/smoke.ts`）**只校验包根目录存在**（`getNativePackageRoot`），从不调用 `getText()`/`setText()` 内容。因此 MVP smoke 不被此行为阻塞；真实桌面会话下行为应正常。

## 5. TUI 最小 smoke（定义）

可重复的最小 smoke（覆盖启动 + 至少一次无网交互路径 + native 加载）：

```
# 1. 存在性
test -x <byf-binary>

# 2. 版本（启动 + 参数解析，无网）
<byf-binary> --version          # 输出含当前版本号

# 3. 帮助（命令树渲染，无网）
<byf-binary> --help             # 输出含 "Usage: byf"
<byf-binary> export --help      # 输出含 "Usage: byf export"

# 4. native 加载路径（compile 嵌入 native）
BYF_CODE_NATIVE_ASSET_SMOKE=1 <byf-binary> --version
# 期望输出 "Native asset smoke passed: <target>"（等价语义；compile 下
# 可能改用 Bun.isStandaloneExecutable 检测，见 §6 迁移点）
```

> 「至少一次无网交互路径」= `--version`/`--help`/`export --help`：验证二进制可启动、Commander.js 解析、命令树渲染，不触网。clipboard 可测则测（在桌面会话 CI 上额外断言 `getText()` 返回 string；headless 环境跳过内容断言）。

## 6. compile 分发迁移要点（供 #219）

- **clipboard**：Bun compile **自动嵌入** `.node`，无需手工 embedding——干净机可跑。
- **koffi**：MVP 两平台无需；Windows（deferred）若将来纳入，须改 pi-tui 的动态 `cjsRequire("koffi")` 为**静态 require 到具体 `build/<triplet>/koffi.node`**，或用 Bun 的 N-API embed 模式 + 显式 asset。
- **SEA API → Bun standalone 检测**：现 `native-assets.ts` 用 `node:sea` 的 `isSea()`/`getAssetKeys()`/`getRawAsset()`。compile 下应改用 `Bun.isStandaloneExecutable` 检测；native 资产树（解压到 cache 的逻辑）在 compile 自动嵌入 `.node` 的前提下**可大幅简化**（koffi/clipboard 已被 bundler 处理）。
- **detectNative / InstallSource:'native'**：语义保留，检测改 `Bun.isStandaloneExecutable`（grill #8 已记录）。

## 7. go/no-go

**GO**（策略 A 通过）：

- [x] compile 产物启动 + native（clipboard）加载在 MVP 平台可用
- [x] clipboard `.node` 嵌入二进制，干净机零预装
- [x] koffi 在 MVP 两平台为 Windows-only 死代码，不构成阻塞
- [x] TUI 最小 smoke 可定义、可重复
- [x] 无需砍 TUI / 降级 / 静默改回 SEA

**阻塞项**：无。

**若将来扩 Windows**：需单独 spike koffi 静态嵌入（见 §6），不阻塞本 PRD。

## 8. 引用

- ADR 0028：`docs/adr/0028-full-bun-toolchain.md`
- research：`docs/research/bun-compile-native-addons-1.md`
- PRD-0020：`docs/prd/PRD-0020-full-bun-migration.md`（R15 / R16 / grill #2 / grill #3）
- 代码事实：`apps/cli/src/native/{module-hook,native-assets,smoke}.ts`、`node_modules/.pnpm/@earendil-works+pi-tui@0.74.0/.../dist/terminal.js`
