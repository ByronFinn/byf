# 常见使用案例

以下是 Kimi Code CLI 的典型使用场景和 prompt 示例。

## 理解陌生项目

接手陌生仓库时，用 `kimi --plan` 或按 `Shift-Tab` 进入 Plan 模式，让 Agent 先输出调研计划：

```
帮我梳理这个仓库的整体架构。重点说清楚：
1. 入口在哪里，启动后做了什么
2. 主要模块之间的依赖关系
3. 配置和数据的加载流程
最后画一张简单的模块关系图。
```

聚焦问题直接问：

```
src/runtime 下的 event loop 是怎么工作的？事件从哪里产生、又被谁消费？
```

```
这个项目里「权限审批」是怎么实现的？涉及哪些文件，关键类型是什么？
```

大型调研可以让主 Agent 派生 **子 Agent** 并行处理子任务，详见 [Agents](../customization/agents.md)。

## 实现新功能

描述清楚需求和验收标准即可。复杂需求建议先用 Plan 模式生成方案。

```
在 src/utils 下新增一个 retry 工具：
- 函数签名 retry<T>(fn: () => Promise<T>, options): Promise<T>
- 支持 maxAttempts、initialDelayMs、backoffFactor 三个选项
- 失败时抛出最后一次的错误
- 并补一组单元测试覆盖成功、重试后成功、全部失败三种情况
```

如不满意，直接告诉助手即可，无需手动编辑：

```
backoff 算了一个固定值，我希望加一点抖动，避免雷击效应。改一下并更新测试。
```

## 修复 bug

把现象、复现条件和期望行为一次性说清楚：

```
跑 npm test 时偶发地报这个错：

  TypeError: Cannot read properties of undefined (reading 'id')
      at SessionStore.update (src/session/store.ts:142:18)

只在并发触发多个 update 的用例里出现。帮我定位原因并修复，最后跑一次完整测试确认。
```

不确定原因时，让它先调查：

```
用户反馈：登录成功后第一次刷新页面会回到登录页，再刷一次就正常了。先帮我排查可能的原因，列出几个最可疑的位置，等我确认方向后再动手改。
```

纯机械任务直接放手：

```
跑一遍测试，失败的用例都修掉，跑完再跑一次确认全绿。
```

## 写测试与重构

边界清晰、验收标准明确的任务特别适合交给 Agent：

```
src/parser/markdown.ts 目前几乎没有测试。请补一组单元测试，覆盖正常段落、嵌套列表、代码块、表格、引用块和混合场景。用项目里已有的测试风格。
```

```
把 src/handlers 下重复的「读 body → 校验 → 写日志 → 返回」逻辑抽成一个中间件。改完跑一遍测试，保证现有行为不变。
```

多文件重构建议先用 Plan 模式确认方案，可用 `/fork` 试探替代方案。

## 一次性脚本与自动化任务

批量改文件、跑统计、调研对比等任务用一段 prompt 就能完成：

```
把 src 目录下所有 .js 文件里的 var 声明改成 const 或 let，能用 const 的优先用 const。改完跑一次 lint 确认。
```

```
分析 logs/ 下最近 7 天的访问日志，按接口路径统计调用次数、p50 和 p99 响应时间，结果输出成一个 markdown 表格。
```

```
帮我调研一下 TypeScript 里几种主流的依赖注入方案（tsyringe、inversify、awilix），从 API 风格、装饰器依赖、运行时开销三个维度对比，给一份不超过一页的建议。
```

用 `--yolo` 或 `/yolo` 跳过审批，或用 [permission 配置](../configuration/config-files.md#permission) 给特定工具加白名单。

## 生成与维护文档

```
我刚改了 src/auth/login.ts 的接口签名，把对应的 JSDoc、README 里的示例代码、还有 docs/zh/guides 下提到这个接口的段落都同步更新一遍。
```

```
src/api 下所有公开函数里，凡是没有 docstring 的都补上文档注释，风格参考已有的注释。
```

```
根据 src/cli 下的命令实现，生成一份命令参考的草稿，列出每个子命令、参数和默认值，放到 docs/zh/reference 下我后续审阅。
```

需要留档或复盘时，用 `kimi export <sessionId>` 打包为 ZIP。
