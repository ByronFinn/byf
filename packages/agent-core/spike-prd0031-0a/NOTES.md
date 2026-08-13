# PRD-0031 PR1-0a-spike — shell-decompose 覆盖率验证

**Question**: shell-decompose（Approach A：按 `; && || |` 分解 + `bash -c`/`sh -c` 剥离 +
路径参数提取 + 间接执行检测）能否把真实编码场景的基准命令集完整解析成 `(path, op)` 序列，
覆盖率 ≥80% → GO？

**Date**: 2026-08-13

## Verdict: GO ✅ — 44/44 = 100% 覆盖（门禁 ≥80%）

| 类别 | 数量 | 说明 |
|---|---|---|
| narrow | 33 | 提取到具体 `(op, path)`（含 git 读写分类、敏感文件命中） |
| broad | 7 | 合法宽化：build/test 动词（node_modules 不可预测）、网络动词、stdin 管道 |
| force-approval | 4 | 按设计转强制审批：`eval`、`source`、`python -c`、`node -e`（已知绕过面） |
| missed (GAP) | 0 | 静态命令解析失败 — **无** |

## 关键 AC 验证

- `cat .env` / `cat ~/.ssh/id_rsa` → `read:<path> ⚠SENSITIVE` → 可硬拒（PATH_SENSITIVE）
- `echo hi; rm x` → `rm` 识别为独立子命令，`write:x`（PRD AC 逐子命令匹配的前提）
- `bash -c "git status && git log"` / `sh -c "cat .env"` → 剥壳递归，内层敏感检测生效
- `eval "$CMD"` / `source ./setup.sh` → 间接执行 → 强制审批（按设计）
- `python -c` / `node -e` → 解释器内层代码 → 已知绕过面 → 强制审批（按设计，0c 文档化）
- git 子命令分类：status/log/diff/show=read；add/commit/push/checkout/merge=write
- 管道、重定向（`> file`）、glob（`rm *.tmp`）、`||`、`sudo` 前缀均正确

## 解析器要点（PR2-0a-parse 实现时吸收）

1. **quote-aware tokenizer + 顶层操作符切分**（不在引号内切）是基础，实测可靠。
2. **write 动词（rm/mv/cp/touch/mkdir）的裸 token 按定义就是路径**——`rm x` 的文件不存在，
   "有扩展名"启发式会漏；write 动词须收所有非 flag 非 value 的 token。
3. **redirect 目标须从 verb 参数提取中排除**，避免 `echo x > f` 双重计数。
4. **`cd` 是高频动词**，取一个 path 参数，且影响后续相对路径的 cwd 解析（实现时按子命令串行累计）。
5. **git 需要子命令级分类**：`git <sub>` 先找子命令再定 op，value-flag（-m/-C 等）跳过。
6. **build/test 动词（npm/bun/cargo/make…）宽化为 any-file write**，除非带具体文件参数
   （`bun test test/foo.test.ts` → narrow）。
7. **间接执行动词表**：eval/source/`.`/exec/command/xargs → 强制审批；解释器 -c/-e → 已知绕过面 → 强制审批。
8. 覆盖率靠"三分类"诚实测量：narrow（具体路径）、broad（合法宽化）、force-approval（按设计），
   **missed 才是真缺口**——本 spike 为 0。

## 原型处置

- 解析器核心（decompose.ts 的动词表/启发式）将被 PR2-0a-parse 的真实实现吸收（TDD 重写）；
  基准命令集（benchmark.ts BENCH）作为 PR2 测试用例的种子。
- 本目录在 PR2 完成、基准用例转录进真实测试后删除。
