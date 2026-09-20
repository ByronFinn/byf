---
name: gen-changesets
description: Use when generating changesets in the byf repository, covering package bump selection, CLI bundle handling, bump levels, major confirmation, and changelog wording.
---

# Generate Changesets

`byf` 用 changesets 管理版本与 changelog。当前面向用户发布的包是:

- `@byfriends/cli`:CLI。它的产物 `dist/main.mjs` 内联 bundle 了 `@byfriends/sdk` 的源码,而 `@byfriends/sdk` 又引入 `@byfriends/agent-core`、`@byfriends/kosong`、`@byfriends/kaos`、`@byfriends/oauth` —— 这些内部包的源码最终都会进入 CLI 产物。

其余 public 包:`@byfriends/sdk`、`@byfriends/agent-core`、`@byfriends/kosong`、`@byfriends/kaos`、`@byfriends/oauth`、`@byfriends/web-server`(`byf web` / `byf vis` 启动的那个服务器,CLI 以运行时依赖携带,不进入 CLI bundle)。

private 包(不发布):`@byfriends/web-client`(SPA,构建产物被复制进 `@byfriends/web-server` 的 `dist/public` 随之发布)、`@byfriends/web-shared`(线路 DTO,type-only)、`@byfriends/storage`(在建:wire 2.0 的 SQLite 会话存储后端,PRD-0037;`private: true`,不参与发布集,改动不要单独列进 changeset)。

已删除的包,任何 changeset 里都不该再出现:`@byfriends/vis-server`、`@byfriends/vis-web`、`@byfriends/vis` —— `apps/vis` 整棵树已在 PRD-0038 R5(AC-5.6)移除,会话可视化并入 `@byfriends/web-server`(ADR-0037)。

## Core Rules

1. **先看真实改动。** 用 `git status` / `git diff --name-only` 确认实际改了哪些包。
2. **列出 changesets 能发布的包。** 本仓库 `.changeset/config.json` 的 `ignore` 为空,没有"忽略包与非忽略包不能混在同一个 frontmatter"的限制。
3. **进入 CLI bundle 的内部包源码改动,要手动列 CLI。** `@byfriends/sdk`(以及它带进来的 agent-core/kosong/kaos/oauth)位于 CLI 的 devDependencies,源码被 bundle 进 `dist/main.mjs`。changesets 会因内部依赖更新把 CLI 自动 patch bump,但**不会替你写 CLI 的 changelog 条目**。当改动改变了 CLI 用户可见的行为时,必须在 frontmatter 列出 `@byfriends/cli`,并在正文描述用户实际能感知的变化。
4. **`@byfriends/web-server` 不进 CLI bundle,但它就是 CLI 的功能。** 它在 CLI 的 `dependencies` 里,而 `apps/cli/scripts/build.mjs` 用 `--never-bundle @byfriends/web-server` 把它排除在 `dist/main.mjs` 之外,所以它的改动**不进入** CLI bundle,不适用规则 3 的 bundle 判断。但用户是通过 `byf web` / `byf vis` 用到它的:凡是改变 CLI 用户可感知行为的,`@byfriends/web-server` 与 `@byfriends/cli` 一起列(见 `.changeset/merged-workbench.md`);纯服务端内部修复只列 `@byfriends/web-server`(见 `.changeset/prd-0034-web-missing-session-404.md`)。
5. **private 包不发布。** `@byfriends/web-client`、`@byfriends/web-shared`、`@byfriends/storage` 都是 `private: true`。用户可见性一律用 `@byfriends/web-server` / `@byfriends/cli` 的条目表达;列 private 包只影响其本地版本号,不影响任何发布产物。
6. **纯文档 / 纯测试改动通常不需要 changeset。** README、内部文档、`test/` 下不进入包产物的改动不触发 bump。

## Workflow

1. 列出改动的包,判断每个是否进入 CLI bundle。
2. 为每个包选择 bump 级别。
3. 如果某个进入 CLI bundle 的内部包改动有用户可见影响,在 frontmatter 额外列 `@byfriends/cli`。
4. 在 `.changeset/` 下创建一个简短的 kebab-case 文件。
5. 把互不相关的改动拆成多个 changeset;一个文件只承载一个逻辑改动。

格式:

```markdown
---
'@byfriends/cli': patch
'@byfriends/sdk': patch
---

<简体中文 changelog 条目>
```

## Bump Levels

| 级别    | 何时使用                                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `patch` | Bug 修复;构建/打包修复;不改变行为的内部重构;措辞微调;小范围依赖升级;对已有功能的小幅改进且用户可见影响有限(例如新的快捷键、flag 别名、细微 UX 调整) |
| `minor` | 实质性的新用户可见功能,例如新的 slash command、新的内置工具、新的模式                                                                               |
| `major` | 破坏性变更:不兼容的配置改动、重命名或移除命令/参数、行为语义变化等                                                                                  |

当 `patch` 与 `minor` 拿不准时:如果改动只是改进已有功能、用户可见影响小,即使技术上算"新增"也选 `patch`。`minor` 留给引入用户此前无法做到的实质性新能力。

### Hard rule: confirm with the user before writing `major`

**绝对不要自行决定写 `major`。**

如果你判断某次改动属于 major(破坏性变更、不兼容的用户配置、重命名或移除的命令/参数、改变的行为语义等),必须先停下来,向用户解释为什么,并请求确认。**只有用户明确同意后,才能写 `major`。** 如果用户未回复、回复含糊或不同意,则降级到 `minor`;若 `minor` 也不明确,再降级到 `patch`。这一条是 [AGENTS.md](../../../AGENTS.md) 工作流要求的硬规则,也是本 skill 存在的核心约束之一。

## Wording Rules

- **changelog 正文用简体中文。** 遵循 [`docs/agents/language.md`](../../../docs/agents/language.md) 的语言约定。
- **frontmatter 里的包名和 bump 级别保持原样**(它们是机器解析的 YAML,不属于散文)。
- **整条条目保持简洁。** 目标是一句短句说明做了什么;最多一句加一行用法提示。不写段落,不堆技术细节,不逐一列举子改动。
- **新增用户可见功能时,附一句简短用法提示**,让用户知道怎么试用。限单行 —— 一个命令名、一个子命令、一个 flag,或一行"如何使用"。不解释设计理由,不列边界情况。bug 修复、内部改动、重构不加提示。
  - Slash command:`新增 /foo 斜杠命令列出活跃会话。运行 /foo 查看。`
  - CLI 子命令:`新增 byf web 子命令打开网页界面。运行 byf web 启动。`
  - Flag:`新增 --bar 跳过确认提示。传入 --bar 即可跳过。`
  - 过长(反例):`新增 /foo 命令列出活跃会话,它接受可选 --all 以包含后台会话,支持按名称过滤 /foo <name>,并把结果写入会话记录……`
- 只有 CLI 用户能感知的改动才用面向用户的措辞。
- 不进入 CLI bundle 的内部改动仍可与 CLI 共用一个 changeset,但正文必须如实描述真实改动,不得包装成用户可见功能。
- **不出现**文件名、类名、函数名、PR 编号、commit hash。
- **不含**真实内部端点、key 名、账号名、服务名。需要示例时用 `example.com`、`example.test`、`YOUR_API_KEY` 等中性占位符。
- 避免使用"重构/优化/改进"等模糊词。描述实际发生了什么,或换更具体的措辞。

## When You Are Unsure About a Change

从 diff 能清楚看出的部分生成 changeset。如果某部分改动不清楚、你无法自信地描述它对用户意味着什么,不要猜,也不要用模糊措辞凑数。

1. 先为清楚的部分写好 changeset。
2. 然后用简短清单问用户一次:点名你不确定的具体改动,询问是否可以深入仓库(读相关源码、测试、调用点)以便更准确地描述。
3. 只有用户同意后才读更多代码。如果用户拒绝或不回复,保留已有的简洁措辞,不要编造细节。

## Common Examples

内部包修复了 CLI 用户可见的 bug:

```markdown
---
'@byfriends/cli': patch
---

修复长对话中偶发的工具调用结果丢失。
```

新增用户可见的 slash command(注意简短用法提示):

```markdown
---
'@byfriends/cli': minor
---

新增 /foo 斜杠命令列出活跃会话。运行 /foo 查看。
```

新增 CLI 子命令:

```markdown
---
'@byfriends/cli': minor
---

新增 byf web 子命令打开网页界面。运行 byf web 启动。
```

已有命令新增 flag:

```markdown
---
'@byfriends/cli': patch
---

新增 --bar 跳过确认提示。传入 --bar 即可跳过。
```

内部包改动进入 CLI bundle 但仅内部可见:

```markdown
---
'@byfriends/cli': patch
---

统一工具执行的元数据处理。
```

仅 SDK 源码改动、CLI 未使用:

```markdown
---
'@byfriends/sdk': patch
---

为内部 SDK 调用方澄清会话状态的类型定义。
```

web-server 的纯服务端修复(规则 4 后段,不列 CLI):

```markdown
---
'@byfriends/web-server': patch
---

修复对不存在会话的操作返回 500 而非 404 的问题。
```

CLI 用户可感知的 Web 工作台变化(规则 4 前段,两个一起列):

```markdown
---
'@byfriends/web-server': minor
'@byfriends/cli': minor
---

新增 byf web 子命令,在浏览器中打开网页聊天界面实时驱动 agent(发消息、流式渲染、审批与问答)。运行 byf web 启动。
```

## Red Flags

- 即将写 `major` 却没问用户。
- 新增用户可见功能的条目没有用法提示,或提示写成多行并大谈设计理由。
- 对不理解的改动猜测措辞,而不是先问用户能否深入代码。
- 进入 CLI bundle 的内部包源码改动了,却漏列 `@byfriends/cli`。
- changelog 条目用了英文(违反 `docs/agents/language.md`)。
- 措辞声称的范围超出 diff 实际所做的。
- CLI 条目里出现内部包名、类名或 PR 编号。
- 条目里出现真实内部标识符而非中性占位符。
- frontmatter 里仍写 `@byfriends/vis-server` / `@byfriends/vis-web` / `@byfriends/vis`(已随 `apps/vis` 删除,changeset 会引用到不存在的包)。
- 改了 `@byfriends/web-server` 的用户可见行为却漏列 `@byfriends/cli`——它不进 bundle,但 `byf web` / `byf vis` 就是 CLI 的入口功能(规则 4)。
