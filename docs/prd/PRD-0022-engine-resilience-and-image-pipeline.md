# 引擎韧性与图片摄入管线（上游 cherry-pick）

**Status**: Done
**Created**: 2026-07-11
**Created by**: `/think` + `/story`（2026-07-11）——基于 BYF vs kimi-code 对比分析（`plan.md`）与代码事实校准
**Last updated**: 2026-07-11
**Source**: `.grok/sessions/.../plan.md` 推荐执行序列 + `docs/architecture-debt-roadmap.md` H3 项

## 问题陈述

BYF 从 kimi-code fork 后，上游在三个生产级细节上已显著领先，而 BYF 当前实现存在真实缺口（均经代码定位确认）：

1. **Provider 故障韧性缺口**：`kosong-llm.ts:141-149` 的可重试状态码列表为 `[429,500,502,503,504]`，缺 `529`（provider overloaded）；`loop/retry.ts` 的退避延迟由 `retry.timeouts()` 预计算，**完全不读响应头的 `Retry-After`**；`kosong/errors.ts` 无独立 rate-limit 子类。对比 kimi `errors.ts:138` 列表含 `529` + `parseRetryAfterMs`（`errors.ts:331`）+ `retry.ts:61` 用 `readRetryAfterMs(error) ?? delays[attempt-1]`。
2. **图片摄入缺口**：`tools/builtin/file/read-media.ts` 唯一门控是 `MAX_MEDIA_MEGABYTES` 字节上限，**无压缩、无格式门禁、无原图缓存、无解压炸弹防护**。大截图/高分辨率图片直接打爆 context 与 token 预算；HEIC/AVIF 等格式会被静默塞进 prompt。
3. **H3 cache-key 双源**（架构债档 2）：`deriveCacheKeyFromPromptPlan` 在 `openai-completions.ts:132` 与 `openai-responses.ts:76` 双份维护，且两处空 plan 的缓存语义**故意不同**（completions→空 SHA256 dummy key；responses→undefined 不发 key），双源是正确性地雷。

## 目标

按 ROI 与风险顺序，交付 4 个独立可验证的改进，每个是一个完整 vertical slice：

| 项 | 核心问题 | 方案 | 来源 |
|---|---|---|---|
| H3 | cache-key 双源 + 语义不一致 | 抽单一 helper，显式保留两路径空 plan 差异 | roadmap H3 |
| P0-1 | 缺 529 / 无 Retry-After 解析 / 无 rate-limit 子类 | 补 529 + 加 parseRetryAfterMs + 服务端 Retry-After 覆盖本地退避 + APIProviderRateLimitError 子类 | kimi errors.ts + retry.ts |
| P0-2a | 图片无格式门禁 | 移植 image-format-policy（闭集 + magic-byte sniff + 转换提示） | kimi image-format-policy.ts |
| P0-2b | 图片无压缩/无原图缓存 | 移植压缩主流程 + 内容寻址原图缓存 + caption | kimi image-compress.ts + image-originals.ts |

## 验收标准

### H3 — deriveCacheKey helper 统一

1. `deriveCacheKeyFromPromptPlan` 不再双份存在；改为单一来源（如 `kosong/src/providers/prompt-cache-key.ts` 或 prompt-plan 模块）
2. 两调用方（completions / responses）通过同一 helper，但**显式参数化**空 plan 行为差异（不抹平）
3. 测试覆盖：空 plan → completions 路径仍返回 dummy SHA256、responses 路径仍返回 `undefined`；非空 plan 两路径同构
4. kosong 包测试 + agent-core 类型检查通过

### P0-1 — Provider 故障韧性

5. `isRetryableError` 可重试列表加入 `529`（`kosong-llm.ts`）
6. `kosong/errors.ts` 新增 `APIProviderRateLimitError extends APIStatusError`；`normalizeAPIStatusError` 对 429 强制归一化为该子类
7. 新增 `parseRetryAfterMs(header)`：解析 HTTP `Retry-After` 头，整数秒 → ms；HTTP-date 或非法 → `null`
8. `APIStatusError` 持有 `retryAfterMs: number | null`；`chatWithRetry` 在 `retry-after` 存在时**用服务端值覆盖本地退避**（`readRetryAfterMs(error) ?? delays[attempt-1]`）
9. 单元测试：529 重试、Retry-After 解析（整数秒/date/非法）、Retry-After 覆盖本地退避、rate-limit 子类归一化
10. 不触碰 kimi 专有 wire；不改变现有 `[429,500,502,503,504]` 的重试行为（只新增，不删减）

### P0-2a — 图片格式门禁

11. 新增 `tools/support/image-format-policy.ts`：定义 `MODEL_ACCEPTED_IMAGE_MIMES = {png,jpeg,gif,webp}` 闭集
12. AVIF/HEIC/HEIF/BMP/TIFF/ICO 被拒，返回带平台相关转换命令的文本 notice（不阻塞 session）
13. magic-byte sniff 校正声明的 MIME（`resolveEffectiveImageMime`）：标签撒谎以字节为准
14. `ReadMediaFileTool` 在返回多模态 content 前调用门禁；被拒图替换为 notice，不进 prompt
15. 测试覆盖：每种被拒格式 → notice；mime 撒谎 → 校正；闭集内格式透传

### P0-2b — 图片压缩 + 原图缓存

16. 新增 `tools/support/image-compress.ts`：edge ≤2000px（可配）、byte budget、JPEG quality ladder、area-average 缩放
17. 新增 `tools/support/image-originals.ts`：内容寻址（sha256）缓存、随会话清理、best-effort（FS 失败不阻塞）
18. `ReadMediaFileTool` 在格式门禁通过后调用压缩；重编码时附加 `<system>Image compressed...</system>` caption（含原图 readback 路径）
19. 防解压炸弹：`MAX_DECODE_PIXELS` / `MAX_DECODE_BYTES` 门控
20. 验证 Jimp + 依赖在 `bun build --compile` 下可打包（spike 记录）
21. 测试覆盖：fast-path 透传、压缩阶梯、原图缓存幂等、decode 炸弹防护

## 非目标

- **print drain**（plan.md P0-3）：需先验证 BYF `-p` 模式是否真有后台任务丢失问题，本 PRD 不含；待 P0-1/2a/2b 完成后单独评估
- **micro-compaction**（plan.md P1 #8）：kimi 侧 `agent/compaction/micro.ts` 的 `detect()`/`compact()` 已是禁用 dead code，不移植；BYF 的 observation-masking/offload 路线继续独立深化
- **H2 BackgroundManager 拆 OutputStore**（roadmap 档 3）：需先补 ring buffer/abort 单元测试，是独立工作项，不在本 PRD
- **select_tools / SSHKaos / ACP**：均需产品方向确认，不在本 PRD

## 技术约束

- **P0-1 必须不碰 kimi wire**：只借「思想 + 错误类形状」，实现适配 BYF 现有 `errors.ts` 层级
- **P0-2 必须验证 Jimp + Bun compile 兼容性**：Jimp 带 wasm decoder（WebP），`bun build --compile` 打包行为是最大风险点；若不可行，回退到 PNG/JPEG only + sharp（需重新评估）
- **H3 不得抹平语义差异**：两路径空 plan 的不同行为是刻意的，helper 必须参数化而非统一
- 所有改动遵守 ADR-0006（分层：CLI→SDK→core）、ADR-0028（Bun only）

## Child Issues

- #230 — [PRD-0022] 统一 deriveCacheKeyFromPromptPlan helper — 消除 cache-key 双源 + 保留空 plan 语义差异 (AFK)
- #231 — [PRD-0022] Provider 故障韧性 — 529 重试 + Retry-After 解析 + rate-limit 子类 (AFK)
- #232 — [PRD-0022] 图片格式门禁 — image-format-policy 闭集 + magic-byte sniff (AFK)
- #233 — [PRD-0022] 图片压缩 + 原图缓存 — compress 主流程 + 内容寻址缓存 + caption (AFK, blocked by #232)

## Traceability

- **Created by**: `/think`（基于 plan.md 对比分析）→ `/story`（vertical slice 拆分，2026-07-11）
- **Source**: `.grok/sessions/.../plan.md` §6/§7 推荐执行序列 + `docs/architecture-debt-roadmap.md` H3
- **Sliced by**: `/story`（4 issues，按依赖序：H3 → P0-1 ‖ P0-2a → P0-2b）
- **Implemented by**: `/implement`（2026-07-11，sub-agent driven，4 commits：79b0375 / b41e429 / 4d1719e / 18f94fb）
- **Verified**: 全量 typecheck 通过；`bun build/run-tests.mjs` 383 文件全绿
