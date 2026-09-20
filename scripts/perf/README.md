# 引擎性能剖析负载(PRD-0026)

可重复的进程内负载脚本,把 Bun 长会话的「GC 打满」拆解为可归因的热点函数与 GC 时间占比。
脚本直接构造 `Agent`(不经过 CLI TUI),在 `AgentConfig.generate` + `providerManager` 双注入点
回放脚本化流式输出,零 API 成本、完全可重复。

> 独立薄副本:复用 `AgentConfig.generate` 注入模式(函数层,先例见
> `packages/kosong/test/fixtures/echo-provider.ts` 的 `ScriptedEchoChatProvider` 与
> `packages/agent-core/test/agent/harness/` 的 scripted-generate),但不 import 测试内部设施
> (测试代码非稳定 API),mock 生成器随脚本自带。

## 三模式

| 模式 | 含义               | 说明                                                                                             |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `a`  | 交互长会话(主场景) | 多 turn、每 turn 多 step 多工具、大输出                                                          |
| `b`  | resume 大会话      | 先跑长会话产出 wire,再 resume 全量 replay 测恢复峰值                                             |
| `c`  | 多 subagent 并行   | 脚本内 `Promise.all` 并行 spawn `--subagents` 个子 agent,各自跑独立长会话,放大并发分配与内存峰值 |

## 快速开始

```sh
# 模式 A,默认基线(50 turn、每 turn 3-5 step、大输出、wire 10-30MB 量级)
bun scripts/perf/load.ts --mode a

# 2x 压力档(turns / output / tool-result 翻倍)
bun scripts/perf/load.ts --mode a --scale 2

# 模式 B / C
bun scripts/perf/load.ts --mode b
bun scripts/perf/load.ts --mode c
```

## 规模参数(默认基线)

| 参数               | 默认 | 说明                                                                                     |
| ------------------ | ---- | ---------------------------------------------------------------------------------------- |
| `--turns`          | 50   | turn 数                                                                                  |
| `--steps "3-5"`    | 3-5  | 每 turn step 数范围(确定性伪随机)                                                        |
| `--tools`          | 2    | 每 step 工具调用数                                                                       |
| `--output-kb`      | 15   | 每 turn 最终输出 KB(分块流式,复现流式事件风暴)                                           |
| `--tool-result-kb` | 20   | 每次工具结果 KB(1x 约 5K token,**低于 8K token offload 阈值**;2x 超过阈值会触发 offload) |
| `--prompt-kb`      | 2    | 每 turn 用户输入 KB                                                                      |
| `--subagents`      | 5    | 模式 C 子 agent 数上限                                                                   |
| `--child-turns`    | 4    | 模式 C 子 agent 每实例 turn 数                                                           |
| `--seed`           | 42   | 确定性随机种子,同参数可复现                                                              |
| `--scale 1\|2`     | 1    | 压力档:2 使 turns/output/tool-result/child-turns 翻倍                                    |
| `--gc-interval-ms` | 500  | 定时 `gc()` 采样间隔(`--expose-gc` 时生效)                                               |
| `--json`           | off  | 输出机器可读 JSON 摘要(含内存采样曲线)                                                   |

历史规模:10-step、每 step 2 工具的 turn ≈ 35-60 条 wire 记录;50 turn 会话 ≈ 2000-3000 条记录,
wire 常见几 MB~几十 MB(模式 B 结束时打印 `wire:` 字节数)。

## CPU 采谱(R2)

```sh
# markdown 报告(专为 LLM 分析设计),输出到 ./cpu-profile*.md
bun --cpu-prof --cpu-prof-md --cpu-prof-interval=1000 scripts/perf/load.ts --mode a --json

# 指定输出目录/文件名
bun --cpu-prof --cpu-prof-dir docs/perf --cpu-prof-name mode-a.cpuprofile \
    --cpu-prof-md --cpu-prof-interval=1000 scripts/perf/load.ts --mode a --json

# 堆快照 + 堆增长曲线
bun --heap-prof --heap-prof-md scripts/perf/load.ts --mode a --json
```

## GC 量化(R3)— 三管齐下

```sh
# 1) 插桩计时:--expose-gc + 脚本内定时 gc()(turn 边界确定性采样 + setInterval 补充)
bun --expose-gc scripts/perf/load.ts --mode a --json

# 2) 并发 GC 对照:关并发 GC,GC 上主线程,与默认组总 CPU 时间之差估算 GC 主线程贡献
BUN_JSC_useConcurrentGC=0 bun --expose-gc scripts/perf/load.ts --mode a --json

# 3) 分配行为探针(非稳定 API,仅调试用;选项全集见 WebKit OptionsList.h)
BUN_JSC_collectContinuously=1 bun --expose-gc scripts/perf/load.ts --mode a --json
BUN_JSC_gcMaxHeapSize=1073741824 bun --expose-gc scripts/perf/load.ts --mode a --json
```

## --smol 对照(R4)

```sh
bun --smol --expose-gc scripts/perf/load.ts --mode a --json    # 更频繁 GC 组
bun --expose-gc scripts/perf/load.ts --mode a --json           # 默认组
```

对比两组 GC 样本数 × 单次时长,验证「GC 是放大器而非根因」假设。

## 输出

- 人类可读摘要:wall 时间、GC 样本数/耗时/占比、内存峰值(peakRss/peakHeap)与堆增长起止值、
  records 数、wire 字节数、resume 耗时、subagent 完成数。
- `--json`:上述全部 + `memorySamples` 内存采样曲线(200ms 间隔 + 起止各一次)。

## 注意事项

- 负载脚本不 import 测试内部设施,复用模式见 `packages/agent-core/test/agent/harness/`。
- dummy provider 必须带非空 `apiKey`(凭证校验在 `resolveRuntimeProvider`,`runtime-provider.ts:100-110`,模型解析时触发)。
- 模式 A/C 用内存持久化(免文件);模式 B 必须用文件持久化 + 临时 homedir(resume 全量 replay)。
- 模式 C 直接在脚本内 `Promise.all` 并行驱动子 agent,不走 Agent 工具的 background 路径——
  那是 Session 级设施(后台任务完成注入、Task\* 工具激活、turn/step 重对齐),对基准脚本过重且脆弱。
  各子 agent 用不同 seed,负载形态有差异但仍可复现。
- 2x 压力档的工具结果超过 offload 阈值(8K token):模式 B(有 homedir)会触发 scratch 卸载,
  模式 A/C(无 homedir)输出保持内联——这是预期行为,不是错误。
- 真实 provider 校准(可选):mock 与真实的比例关系验证不在脚本内,需自行注入真实
  `AgentConfig.generate` 包装(见 PRD R1「可选校准」)。

---

# 二进制启动基线与裁决脚本(PRD-0038 R4)

与上面的进程内负载脚本(`load.ts`)相互独立:这三个脚本不改生产代码,一律以真实子进程启动被测物,
测量结论落在 `docs/perf/REPORT-0038.md`。

| 脚本                  | 职责                                                                  | 产物                                     |
| --------------------- | --------------------------------------------------------------------- | ---------------------------------------- |
| `binary-baseline.mjs` | 三臂(`bun src` / `bun dist` / 编译二进制)冷/热启动 + RSS + 体积 floor | `baselines/linux-x64.json`(基线,即阈值)  |
| `bytecode-ab.mjs`     | `--bytecode` A/B:体积、启动、native addon 与 SPA 内嵌的功能退化验证   | `/tmp/byf-bytecode-ab/`(临时,重生成即可) |
| `tui-idle.mjs`        | TUI 空闲 CPU(真机两相位)+ 固定 tick vs draw-on-change 合成对照        | stdout(结论入报告)                       |

```sh
# 基线复跑(约 2.5 分钟;--skip-cold/--fast 可裁剪),写回仓内基线文件:
bun scripts/perf/binary-baseline.mjs measure --json=baselines/linux-x64.json

# AC-4.3 环比判定:一条命令、超出基线派生阈值即非零退出并逐格打印差值。
# 共享 runner 偏吵时加 BYF_PERF_GATE_SLACK=15(百分点),不要改基线。
bun scripts/perf/binary-baseline.mjs gate

# --bytecode 与 TUI 空闲裁决的复测:
bun scripts/perf/bytecode-ab.mjs
bun scripts/perf/tui-idle.mjs --window=3000 --windows=10
```

- 冷缓存配方是 per-file `posix_fadvise(DONTNEED)`(文件集由 `bun build --metafile` 解出),不用
  root-only 的 `drop_caches`;eviction 计数为 0 的格子会被如实标成非冷,不冒充 cold 数字。
- 前置产物:需先有 `apps/cli/dist/main.mjs` 与 `apps/cli/dist-native/bin/<target>/byf`
  (官方 `build:native` 管线;已知 `compile-entry.ts` 缺陷时脚本用修复后的中间产物并显式标注来源)。
- `measure`/`gate` 会以「原地重建 + 逐字节还原」方式临时替换 `apps/cli/dist/main.mjs` 来测
  `--target bun` 变体;进程中途被杀时从 `/tmp/byf-dist-backup-*` 手动还原。
