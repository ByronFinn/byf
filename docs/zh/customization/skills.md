# Agent Skills

Agent Skills 是 BYF 用来扩展模型能力的轻量机制。一个 Skill 就是一份带 YAML frontmatter 的 Markdown 文档，描述某项专业知识或工作流程。BYF 在启动时自动扫描已知目录，把发现的 Skill 注入到系统提示词中，让 Agent 知道当前会话里有哪些可用的 Skill。

相比把同样的指引每次都粘到提示词里，Skill 的好处在于：内容沉淀在文件里、可以跨项目和团队复用、可以通过斜杠命令一键加载，也可以让模型在需要时自动调用。常见用法是把代码风格、提交规范、审查流程等固化为 Skill。

## 创建 Skill

Skill 文件需要放在 [已知的扫描目录](#skill-存放位置) 中。一个 Skill 可以使用两种文件结构：

- **目录形式（推荐）**：在 Skills 目录下创建一个子目录，主文件命名为 `SKILL.md`，必要时可在同目录下放置脚本、参考资料等辅助文件。如果同一目录下同时存在 `<name>/SKILL.md` 和同名的 `<name>.md`，以子目录为准。
- **扁平形式**：直接使用单个 `.md` 文件，Skill 名称取文件名（去掉 `.md`）。

### 文件格式

`SKILL.md` 由 YAML frontmatter 和 Markdown 正文两部分组成。

```markdown
---
name: code-style
description: 项目代码风格规范，定义命名、缩进、注释和文件组织
type: prompt
whenToUse: 当用户让我编写、修改或审查项目源代码时
disableModelInvocation: false
arguments:
  - target
  - mode
---

请按下述规范处理代码：

- 缩进使用 2 空格
- 变量名使用 `camelCase`，类型名使用 `PascalCase`
- 公开函数必须带 TSDoc 注释
- 单行不超过 100 字符
```

### Frontmatter 字段

| 字段 | 说明 |
| --- | --- |
| `name` | Skill 名称。目录型 `SKILL.md` 中为必填；扁平 `.md` 文件省略时使用文件名。名称大小写不敏感。 |
| `description` | 一行总结。模型用它来判断何时使用这个 Skill。目录型 `SKILL.md` 中为必填；扁平 `.md` 文件省略时回退到正文第一行非空内容（截到 240 字符）。 |
| `type` | Skill 类型。可选 `prompt`（默认）、`inline`（与 `prompt` 语义相同）、`flow`（仅支持手动调用，不支持模型自动调用）。其它值会被跳过。 |
| `whenToUse` | 触发场景描述。也接受 `when-to-use`、`when_to_use` 写法。 |
| `disableModelInvocation` | 设为 `true` 禁止模型自动调用此 Skill。也接受 `disable-model-invocation`、`disable_model_invocation` 写法。 |
| `arguments` | 命名参数列表，可写成字符串数组或空白分隔的字符串（如 `arguments: target mode`）。声明后，正文可用 `$<name>` 读取参数；纯数字或空字符串会被忽略。 |

::: warning 注意
目录型 `SKILL.md` 中 `name` 和 `description` **必须**显式填写，省略任意一项均会导致解析失败。
:::

### 正文占位符

正文在发送给模型前会展开少量占位符：

- `$ARGUMENTS`：调用时附带的完整原始参数字符串
- `$ARGUMENTS[0]`、`$ARGUMENTS[1]` 及简写 `$0`、`$1`：按空白分词后的位置参数（从 0 开始）
- `$<name>`：`arguments` 中声明的命名参数
- `${BYF_SKILL_DIR}`：当前 Skill 文件所在目录

位置参数支持单双引号包裹，如 `/skill:commit "fix login" patch` 中 `$0` 展开为 `fix login`。若正文不含任何参数占位符，调用时附带的文本会以 `\n\nARGUMENTS: <文本>` 的形式追加到正文末尾。

## Skill 存放位置

BYF 按作用域分四档扫描，越具体的作用域优先级越高：

**Project > User > Extra > Built-in**

用户级：

- `~/.byf/skills/`
- `~/.agents/skills/`

项目级（项目根 = 工作目录向上最近的包含 `.git` 的目录）：

- `.byf/skills/`
- `.agents/skills/`

额外目录通过 `config.toml` 顶层的 `extra_skill_dirs` 字段声明：

```toml
extra_skill_dirs = ["~/team-skills", ".agents/team-skills"]
```

内置 Skills 随 CLI 一起分发，优先级最低。

## 调用 Skill

用户可以通过斜杠命令主动调用：

```
/skill:code-style
/skill:git-commits 修复登录接口的并发问题
```

模型也可以根据 `description` 和 `whenToUse` 自动调用 Skill（除非 `disableModelInvocation` 设为 `true` 或 `type` 为 `flow`）。模型调用时，正文先展开占位符，再注入到系统提示中。Skill 调用时最多允许嵌套 3 层，超过后会被终止。

## 完整示例

```markdown
---
name: review-pr
description: 按团队标准审查一个 Pull Request，输出结构化的 review 报告
type: prompt
whenToUse: 当用户让我审查 PR、检查代码变更或评估提交质量时
arguments:
  - pr_ref
---

请按照以下流程审查用户指定的 PR：$pr_ref

1. 拉取并阅读 `$pr_ref` 的全部 diff。
2. 对照以下检查项逐条核对：
   - 是否包含对应的测试用例
   - 公开 API 是否有文档更新
   - 是否引入了新的依赖；若有，说明引入理由
   - 错误处理是否覆盖了边界情况
3. 参考同目录下的检查清单：`references/checklist.md`
4. 输出一份 review 报告，包含：
   - 总体结论（approve / request changes / comment）
   - 必须修改项（blocking）
   - 建议改进项（non-blocking）
   - 值得肯定的地方
```

保存为 `~/.byf/skills/review-pr/SKILL.md`，检查清单放在同目录的 `references/checklist.md`，然后重开会话，即可通过 `/skill:review-pr #1234` 调用，其中 `#1234` 会展开到 `$pr_ref`。
