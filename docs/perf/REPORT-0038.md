# PRD-0038 二进制启动基线与两项裁决(R4)

> **Status**: Final | **PRD**: PRD-0038 R4 | **Created**: 2026-09-21 | **Machine**: linux-x64(WSL2, kernel 5.10.16.3-microsoft-standard-WSL2, 12th Gen Intel i5-12400F × 12 逻辑核), Bun 1.3.14

本报告汇总 `scripts/perf/binary-baseline.mjs`、`scripts/perf/bytecode-ab.mjs`、`scripts/perf/tui-idle.mjs` 在同一台 WSL2 主机上的实测结果,给出两项裁决(`--bytecode` 采纳与否、`STREAMING_UI_FLUSH_MS` 改值与否)与 AC-4.3 的环比判定入口。原始数据:三臂基线在仓内 `scripts/perf/baselines/linux-x64.json`(2026-09-21 05:59 生成,148.5 s,15 计时样本/格);`--bytecode` A/B 原始 JSON 在 `/tmp/byf-bytecode-ab/bytecode-ab.json`(12 样本/格,本机临时产物,按 §8 命令可重生成);TUI 空闲输出在 `/tmp/tui-idle.out`。所有数字均为本机实测,本报告不引用任何厂商基准数字。

## 1. 结论先行(两项裁决 + 判定门)

| 事项                         | 裁决                                                                                          | 关键实测依据                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--bytecode`                 | **采纳**,但带三个前置条件(§4):入口顶层 await 改包、产品构建脚本缺陷先修、采纳 PR 必须重定基线 | 热启动 `--version` −45.2%、`--help` −47.7%、冷 `--version` −26.3%;体积 +36.5%、VmHWM +29.9%;addon/SPA 全部无退化                                        |
| `STREAMING_UI_FLUSH_MS = 50` | **不改值**。业界 50–100 ms 区间是单一厂商自评,对 byf 只是待测假设;本地数据不支持改            | 该常量非帧时钟,空闲无 tick(实测 idle 中位 0.50%,处于 `/proc` 0.33% 分辨率底);固定 50 ms tick 对照组最坏 8.67%,100 ms 仅省 1.34 个百分点,16 ms 达 25.33% |
| AC-4.3 判定门                | 可跑:`bun scripts/perf/binary-baseline.mjs gate`,超阈值返回非零并逐格打印差值                 | 对归档基线复跑退出码 1:12 个 FAIL 全部落在两条已知污染臂,实体三臂 20 格全绿(§6);阈值即基线 JSON(允许量 = 基线观测最坏单样本膨胀 × 2,带上限地板)         |

附带发现(不属于裁决,但基线过程暴露):**HEAD 的 `bun dist/main.mjs` 臂是死臂**——当前 JS bundle 以 `--target node` 构建(`scripts/build` 未传 target,`bun-lib-build.mjs` 默认 node),在 Bun 下模块初始化期即抛 `webidl.util.markAsUncloneable is not a function`,三臂表里该列数字全部无效(§7)。修复属于产品构建管线,另案。

> **修订(2026-09-23)**:死臂事实已被修复——b0e3bc7 把 CLI 的 JS bundle 改为 `--target bun`,`bun dist/main.mjs` 在 HEAD 上可以启动。本报告 §2 表中的死臂数字与归档基线 `bunDist` / `bunDistBun` 列仍是崩溃/失败态的记录,只有 `measure` 重定基线后才会被活态数字覆盖(见 §6「下一步」)。

## 2. 三臂启动基线(AC-4.1)

冷配方 = 对「解析器报告的整个文件集」逐文件 `posix_fadvise(DONTNEED)`(不用 root-only 的 `drop_caches`,§7);热 = 页缓存已驻留。延迟为含 fork/exec 的端到端墙钟,RSS 为 `/proc` VmHWM 峰值中位数。

| 臂(argv)                         | --version 冷 | --version 热 |  --help 冷 | --help 热 |     RSS(热) | cv(热) | 功能 smoke     |
| -------------------------------- | -----------: | -----------: | ---------: | --------: | ----------: | -----: | -------------- |
| control `bun -e 0`(运行时地板)   |     12.81 ms |  **9.14 ms** |          — |         — |    30.5 MiB |   2.9% | —              |
| `bun ./src/main.ts`(源码树)      |    674.90 ms |    495.88 ms |  675.33 ms | 498.11 ms |   185.9 MiB |   0.8% | PASS           |
| `bun dist/main.mjs`(HEAD 产物)   |   ~1168 ms † |    ~780 ms † | ~1169 ms † | ~780 ms † | 210.3 MiB † |      — | **FAIL(死臂)** |
| 编译二进制 `dist-native/.../byf` |    433.65 ms |    317.25 ms |  434.76 ms | 318.95 ms |   139.8 MiB |   0.4% | PASS           |

† 该臂 15/15 样本退出码非零:表中数字是「崩溃到退出」的路径耗时与崩溃前 RSS,**不是启动性能**,只作为死臂存在的旁证保留。归档基线里另有一行 `bunDistBun`(把 `--target bun` 重建产物拷到 /tmp 跑,热 100 ms):同样 INVALID——外部依赖 `zod` 在 /tmp 无法解析。两行都不可用于任何结论。

- 相对地板(热,`--version`):源码树 +486.7 ms(54×control),编译二进制 +308.1 ms(35×control)。**编译二进制在两条路径上都比源码树快约 35–36%,RSS 低约 25%**;冷启动差距(433.7 vs 674.9 ms)同样成立。
- 离群值处置:`median + 5×MAD`(2 ms 绝对底)剔除,每格保留 ≥60%,上表 median 为剔除后中位数(剔除数 0–3/15)。
- **可跑版 `bun dist/main.mjs` 的真实数字**(本报告随 gate 复跑实测,`--target bun` 原地重建态):冷 1174.4 ms / 热 786.5 ms / RSS 264.8 MiB——**它是三臂里最慢、RSS 最高的臂,比源码树还慢约 57%**。机制上自洽:bundle 把整个模块图压进单一 7 MiB 文件、启动即全量解析,而源码树在 `--version` 路径上按需惰性加载。结论:修好 bundle 的构建 target 不会让 `bun dist` 臂变得有吸引力,发布形态的答案仍是编译二进制(或 §4 的 bytecode 形态)。

## 3. 体积地板与 delta(AC-4.1)

体积只以「同 pin Bun(1.3.14)hello-world floor 的 delta」呈现,不设绝对阈值(Bun 升级会整体平移 floor):

| 项                                                                    |        字节 |               MiB |
| --------------------------------------------------------------------- | ----------: | ----------------: |
| hello-world floor(bare,四构建同字节)                                  |  94,582,912 |             90.20 |
| byf 编译二进制(归档基线所测,local compile 态,与 §4 的 plain 臂同字节) | 113,477,760 |            108.22 |
| **delta_bytes(over floor)**                                           |  18,894,848 | **18.02(+20.0%)** |

注意口径:归档基线的 `nativeBinary`(source=preexisting)是 `build:native:compile` 的 **local profile** 产物(无 `--minify`);今天 release profile(`--minify`,§4 参考臂)的产物为 109,295,744 B,delta_bytes = 14,712,832(**14.03 MiB,+15.6%**)。环比 gate 校验的是当次实测产物对同口径基线的差,不比绝对体积。

hello-world 四种构建(bare / `--minify` / `--bytecode` / `--minify --bytecode`)产物字节数完全相同(94,582,912),启动中位数 13.58 / 13.51 / 13.39 / 13.22 ms——**hello 尺度上 `--bytecode` 的收益与损耗都测不出来**(差异 ≤0.36 ms,噪声级)。这正是把 floor 同时作为「方向性负对照」的用法:厂商文献在 hello 尺度方向自相矛盾,本机数据说「无效果」,byf 尺度的 −45%(§4)才是有效信号。floor 换 Bun 版本必须重测(基线 JSON `sizeFloor.note` 已写明)。

## 4. `--bytecode` A/B 与裁决(AC-4.2)

七个臂全部从**同一份**生成的 compile-entry 中间产物编译,官方 release argv(含 defines)直接取自产品构建脚本回放的 `official-argv.txt`,臂间只差被测 flag。参考臂 = `minify`(今天 `build:native:release` 实际发布的配置)。功能验证四项:`--version`/`--help` 退出码、产品自带 native-asset 冒烟(`BYF_CODE_NATIVE_ASSET_SMOKE=1`)、`/proc/<pid>/maps` 里 `.node` 来源(必须是 /tmp 解嵌文件而非宿主 `node_modules`)、`byf web` 真实 HTTP 回吐 index.html + hashed 资产且与磁盘字节一致。

| 臂                                  |     产物 | Δ体积(参考) |   v.冷 |       v.热 |        Δ热 |    help.热 |     RSS(热) |       ΔRSS |    构建 | 功能 |
| ----------------------------------- | -------: | ----------: | -----: | ---------: | ---------: | ---------: | ----------: | ---------: | ------: | ---- |
| plain(无 flag)                      | 108.22 M |      +3.83% | 431.98 |     317.93 |     +12.5% |     320.44 |     139.6 M |      +6.9% |  325 ms | PASS |
| **minify(参考,今日发布配置)**       | 104.23 M |           — | 391.42 |     282.65 |          — |     299.16 |     130.7 M |          — |  311 ms | PASS |
| bytecode(产品入口)                  | 构建失败 |           — |      — |          — |          — |          — |           — |          — |    3 ms | —    |
| minify+bytecode(产品入口)           | 构建失败 |           — |      — |          — |          — |          — |           — |          — |    3 ms | —    |
| bytecode(await 包装入口)            | 147.49 M |      +41.5% | 316.70 |     164.89 |     −41.7% |     161.70 |     177.8 M |     +36.1% | 3869 ms | PASS |
| **minify+bytecode(await 包装入口)** | 142.29 M |  **+36.5%** | 288.33 | **154.87** | **−45.2%** | **156.56** | **169.7 M** | **+29.9%** | 3232 ms | PASS |
| 包装对照(wrap,无 bytecode)          | 108.22 M |      +3.83% | 400.28 |     307.45 |      +8.8% |     311.40 |     140.6 M |      +7.6% |  279 ms | PASS |

数据质量注记:(a) 构建失败臂的报错是 `"await" can only be used inside an "async" function`(compile-entry 第 23 行顶层 await)——**bun 1.3.14 的 `--bytecode` 对 byf 现有入口直接不可编译**,这是采纳的第一个前置;(b) 包装对照臂与 plain 字节数完全相同(108.22 M):热 307.45 ms 反而比 plain 的 317.93 ms 低 3.3%,冷 400.28 比 plain 的 431.98 低 7.3%——入口包装自身无可测代价,但它说明**同字节二进制在批次内跨臂也有最高约 7% 的漂移**(批次之间:归档基线 native 热 317.25 vs plain 臂 317.93,差 0.2%),小于该带的差值一律不采信,而 bytecode 的 −42% 至 −45% 远超该带;(c) `help.热` 参考格本身 cv 6.5%(WSL2 噪声),比较 `--help` 时留意。

### 裁决:采纳 `--bytecode`,带三个前置条件

1. **入口改造**:产品 `scripts/compile/build.mjs` 生成的 compile-entry 顶层 `await import(...)` 必须改为 async 函数包装(本实验的 `asyncWrapEntry` 即候选改法,boot 顺序语义不变),否则 release profile 无法携带 `--bytecode`。
2. **先修构建脚本缺陷**:`writeCompileEntry` 缺成员访问点号(`).__BYF_WEB_EMBEDDED_ASSETS__`)导致带 SPA 资产时官方管线产不进二进制,本轮全部测量是在「修复后的中间产物」上完成的;采纳 PR 必须先修产品脚本本身并走官方管线复测,不接受 bench 修复态。
3. **重定体积/RSS 基线**:体积 +36.5%(+38.05 MiB)、`--version` 路径 VmHWM +29.9%。AC-4.3 的 gate 按 delta_bytes 比较,采纳即把 floor delta 从 18.02 MiB 抬到 ~56 MiB,采纳 PR 必须同步更新 `baselines/linux-x64.json`,否则环比必红。

收益面:热启动两条路径约砍半(282.65→154.87 / 299.16→156.56 ms),冷 `--version` −26.3%;构建时长 3.1 s→3.2 s 级,可忽略;两个最大风险面(native addon 内嵌、SPA 资产内嵌)在四项功能验证下**零退化**——`.node` 仍走 /tmp 解嵌(无宿主回退)、`assets/index-D5Qlaq2y.js` 424,584 B 与磁盘逐字节一致。代价与边界见 §7(退出路径代理、非 TUI 完整 TTI、单平台)。

## 5. TUI 空闲与 `STREAMING_UI_FLUSH_MS` 裁决(AC-4.4)

代码事实(测量前重读):`STREAMING_UI_FLUSH_MS`(`apps/cli/src/tui/constant/streaming.ts:10`)**不是帧时钟**——`turn-event-handler.ts` 的 `scheduleStreamingUiFlush()` 在无 pending 草稿时直接 return,`clearStreamingUiFlushTimerIfIdle()` 在草稿清空即刻拆表。所以「空闲时被 50 ms tick 空转」在机制上不成立,能测的是:真实空闲 CPU(相位 1/2)与「假如它是真 50 ms tick 要付多少」的合成对照(相位 3)。

| 相位 | 对象                               | 驱动                 | 窗口         |                        空闲 CPU(单核%) |
| ---- | ---------------------------------- | -------------------- | ------------ | -------------------------------------: |
| 1    | 真实 byf TUI(编译二进制,PTY)       | 无输入、无流式       | 3000 ms × 10 | **中位 0.50,最大 1.00**(分辨率底 0.33) |
| 2    | 同一进程,按键风暴(400 键/窗)       | 输入驱动重绘         | 3000 ms × 4  |                  中位 36.16,最大 42.66 |
| 3    | 合成对照:pi-tui 渲染层(无产品代码) | draw-on-change(单次) | 4 窗         |                              中位 0.33 |
| 3    | 同上                               | 固定 tick 100 ms     | 4 窗         |                              中位 7.33 |
| 3    | 同上                               | **固定 tick 50 ms**  | 4 窗         |                          **中位 8.67** |
| 3    | 同上                               | 固定 tick 16 ms      | 4 窗         |                             中位 25.33 |

- 空闲即零:真实 TUI 空闲中位 0.50%,与 `/proc` 10 ms 记账粒度在 3 s 窗下的读数底(0.33%)不可区分——**50 与 100 的取值差异在空闲场景下根本不会被执行**,「改成 100 省电」这一动机被实测排除。
- 活跃场景的最坏代价(合成对照把常量当帧时钟用):50 ms tick 8.67% → 100 ms 7.33%,**只省 1.34 个百分点**(相对 15%),代价是流式重绘上限减半;16 ms(60 fps 直觉)25.33%,明确不可取。
- 相位 2 的 ~36% 是按键触发的真实重渲染成本,与 flush 常量无关,列出仅为说明「活跃期 CPU 由渲染路径本身主导,不由该常量主导」。

### 裁决:保持 `STREAMING_UI_FLUSH_MS = 50`,不改值

依据全部来自本地:空闲无差异(机制 + 实测双证),活跃最坏差异 1.3 个百分点且以牺牲重绘频率为代价;业界 50–100 ms 是单一厂商自评的待测假设,不构成改值理由。复议条件:未来若引入「流式主观流畅度/帧间隔」实测(本轮未测,§8)或低配终端出现 TUI CPU 告警,重开此题——届时应测真实流回放,而不是继续外推固定 tick 对照。

## 6. 环比判定门(AC-4.3)

一条命令、退出码判定、逐格打印前后差值:

```sh
bun scripts/perf/binary-baseline.mjs gate
```

**交付状态要说全**:AC-4.3 交付的是**可跑**的判定能力(命令与阈值语义如上,两个方向的结论各实测过一次),但它**没有接进任何 workflow**——`.github/workflows/` 下没有任何 job 调用 `binary-baseline.mjs`(也没有 nightly),跑与不跑仍是人的决定。且以报告完成时的仓内状态,它对**自己归档的全量基线原样执行是红的**(运行 A:退出码 1,12 个 FAIL 全部来自 `bunDist` / `bunDistBun` 两条污染臂,实体三臂 20 格全绿)——红是基线污染的如实反映,不是判定门坏了,也不是代码退化;把它当门禁使用前必须先按「下一步」重定基线。

- 阈值来源:基线 JSON 即阈值。每格允许量 = `max(GATE_FLOOR, 基线该格最坏单样本膨胀 (maxOverMedian − 1) × 2)`,再加热启动 8 ms 绝对松弛。**没有手工魔法数字,全部从 2026-09-21 实测的 `baselines/linux-x64.json` 导出**——即「阈值来自本次实测」;内置地板 cold 25% / warm 15% / RSS 15% / 体积 5% 只防「异常安静的基线把门拧成假红机器」。共享 runner 更吵时用 `BYF_PERF_GATE_SLACK=<percent>` 加乘,而不是改基线。
- 体积按 `delta_bytes`(对同版本 hello floor 的差)比较,绝对体积不比较——Bun 升级只重测 floor,不会把运行时平移误判为代码回归(§3)。
- 噪声处置:离群剔除(5×MAD)、剔除计数入档、`--samples` 下限 10;首次报红先 `--samples=25` 复跑再当真(脚本失败提示原文如此)。
- 本次验证·运行 A(对归档全量基线,一条命令原样执行):**退出码 1,25/37 格 ok**。三个实体臂 control / bunSrc / native 的 20 格全部 ok(热启动当前值 vs 基线:9.1↔9.1、499.6↔495.9、318.7↔317.3 ms,漂移 ≤1.9%);体积 delta_bytes ok(18,894,848 B,与基线字节一致)。12 个 FAIL 全部可归因到两条已知污染臂:`bunDist` 4 格 RSS(基线记录的是死臂崩溃态 215 MB,复跑量到的是原地重建活态 271 MB)与 `bunDistBun` 8 格(基线数字本身是 /tmp 拷贝的失败耗时/足迹)。**判定机制双向有效;这一轮红是基线污染的正确表现,不是代码退化。**
- 本次验证·运行 B(剔除两条污染臂后的基线,`--baseline=/tmp/baseline-clean-3arm.json`):**退出码 0,21/21 格全部在允许量内**(control / bunSrc / native × 冷/热 × 两路径 + 体积 delta)。两方向各证一次:超阈值 → 1,未超 → 0。附带教训:自检期间不小心并发跑了两个 gate,后完成的那轮就因互相干扰把 `bunSrc --help warm` 顶到 586.7 ms(限 580.8)而单格变红——**gate 进程必须互斥执行,这正是 §6 噪声处置与「先 `--samples=25` 复跑再当真」提示的现实注脚**。
- smoke 语义提示:当前 `targets.mjs` 走「原地重建 + 逐字节还原」,复跑时 `bunDist` 与 `bunDistBun` 量到的是同一份活的 `--target bun` bundle(本轮 smoke 四臂全 ok);HEAD 死臂事实由归档 JSON 的 `smoke.bunDist` 记录与本报告 §2 承载。`measure` 模式在任一臂 smoke 失败时按设计退出非零(归档基线当时即因死臂触发,属预期)。
- 下一步(未在本报告执行,避免覆盖前一批实测证据):跑一次 `measure --json=scripts/perf/baselines/linux-x64.json` 重定基线,把两条污染格洗成活态数字,此后 gate 应稳定为绿。

## 7. 局限声明

- **单平台**:全部数据来自一台 WSL2 linux-x64;macOS 未测。冷缓存配方不用 Linux-only 的 root 手段(`drop_caches` 需 CAP_SYS_ADMIN,本机与 hosted runner 都不可用),`posix_fadvise(DONTNEED)` 在 darwin 存在对应 libc 路径;但 RSS/CPU 采样器依赖 Linux `/proc`,macOS 上这些列会降级为 `n/a`(gate 对缺失格跳过比较)——「macOS 配方不依赖 Linux-only 手段或有显式降级说明」按后一半满足。
- **缓存状态**:测的是 per-file-set 冷(fadvise,每格 eviction 计数 >0 且 `cacheVerified:true`:源码树 1938 文件/104.7 MB,bundle 1746 文件/110.9 MB,二进制 1 文件/113.5 MB)+ 页缓存热两档;未测「开机后首次执行」与宿主磁盘缓存层(WSL2 虚拟盘不可清)。
- **未在任何共享 runner 上实测**:runner 噪声处置是机制(§6)+本机 cv(热启动多数格 <1%)的组合,不构成 hosted runner 上不会假红的证明;本机也已实测「同机并发两个 gate」足以顶红单格(§6 运行 B 注),CI 编排需保证互斥。
- **样本与判定规则**:12–15 计时样本/格(预热丢弃),中位数对比,不是均值;A/B 与基线是不同进程批次,同字节对照臂显示 round-to-round 漂移 ≤0.2%,但批次内跨臂漂移观测到 ≤7.3%(§4 注记 b),小于该带的差值一律不采信。
- **代理指标边界**:启动/裁决数字来自 `--version`/`--help` 早退路径与 hello floor,**不是完整 TUI 就绪 TTI**;`byf web` 的 SPA 验证证明资产通路完好,不代表浏览器端性能。
- **数据质量**:归档基线的 `bunDist` 列是死臂的崩溃耗时(§2);`bunDistBun` 列(/tmp 拷贝,100 ms)是模块解析失败的耗时,不构成 `--target bun` 性能证据——现行 `targets.mjs` 已改为「原地重建 + 逐字节还原」,复跑时该臂才真正可跑。(2026-09-23 修订:b0e3bc7 已把 shipped CLI 的 JS bundle 改为 `--target bun`,HEAD 上 `bunDist` 不再是死臂;上面两个「死臂」描述记录的是归档基线生成时的事实,归档列在 `measure` 重定基线前保持污染态。)
- 本机 `apps/cli/dist/main.mjs` 现值已确认为 shipped 态(报告完成时校验,还原路径生效)。

## 8. 未测清单(如实)

1. macOS 全部三臂/裁决数字;clipboard native addon 在非 linux-x64 的表现。
2. 编译二进制「完整 TUI 首帧/交互就绪」时间(tui-idle 只验证了 6 s settle 存活)。
3. TUI 稳态 RSS:该次运行的 GNU time 列未取到值(脚本按设计静默跳过),空闲基线里无此项。
4. 不同 `STREAMING_UI_FLUSH_MS` 取值下的真实流式回放对比(主观流畅度、帧间隔、端到端 TTI)——裁决 §5 依赖的是机制论证 + 空闲实测 + 合成最坏代价,未测感知维度。
5. `--compile-jit-policy`:PRD-0038 已判定 byf 版本门槛不满足(canary-only),未测。
6. 共享 hosted runner 上的 gate 假红率实测(机制已备,数据未采)。

## 9. 复跑方法

```sh
# 三臂基线(约 2.5 分钟,12–15 样本/格),写回仓内基线文件:
bun scripts/perf/binary-baseline.mjs measure --json=scripts/perf/baselines/linux-x64.json

# 环比判定(退出码即结论):
bun scripts/perf/binary-baseline.mjs gate

# --bytecode A/B(需先有 dist 与 dist-native 产物;产物与 JSON 落在 /tmp/byf-bytecode-ab):
bun scripts/perf/bytecode-ab.mjs

# TUI 空闲三分相位:
bun scripts/perf/tui-idle.mjs --window=3000 --windows=10
```

前置构建见 `scripts/perf/README.md`;脚本内部机制(冷配方、VM HWM 采样、离群规则、包装入口的动机)以各脚本文件头注释为准。

## Traceability

- **覆盖**:PRD-0038 R4 / AC-4.1(三臂 + floor delta 基线,仓内 JSON)、AC-4.2(`--bytecode` 实测裁决)、AC-4.3(`gate` 一条命令、非零退出)、AC-4.4(空闲/对照 + 取值裁决记录)。
- **原始数据**:`scripts/perf/baselines/linux-x64.json`(入库);`/tmp/byf-bytecode-ab/bytecode-ab.json`、`/tmp/tui-idle.out`(本机临时,按 §9 重生成)。
