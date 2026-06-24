# Agent Skills

Agent Skills are the lightweight mechanism BYF uses to extend a model's capabilities. A skill is a Markdown document with YAML frontmatter that describes a piece of expertise or a workflow. BYF scans known directories on startup and injects the discovered skills into the system prompt, so the agent knows which skills are available in the current session.

Compared to pasting the same guidance into the prompt every time, skills offer these advantages: the content is captured in a file, reusable across projects and teams, can be loaded with a one-shot slash command, and can also be invoked automatically by the model when needed.

## Creating a skill

Skill files must be placed in a [known scan directory](#skill-locations). A skill can use one of two file structures:

- **Directory form (recommended)**: create a subdirectory with the main file named `SKILL.md`. You can also place scripts, references, and other auxiliary files in the same directory. If both `<name>/SKILL.md` and a flat `<name>.md` exist in the same directory, the subdirectory wins.
- **Flat form**: use a single `.md` file directly; the skill name defaults to the filename with `.md` removed.

### File format

`SKILL.md` consists of two parts: YAML frontmatter and a Markdown body.

```markdown
---
name: code-style
description: Project code style conventions, covering naming, indentation, comments, and file organization
type: prompt
whenToUse: When the user asks me to write, modify, or review the project's source code
disableModelInvocation: false
arguments:
  - target
  - mode
---

Please handle the code according to the following conventions:

- Use 2-space indentation
- Use `camelCase` for variable names and `PascalCase` for type names
- Public functions must have TSDoc comments
- Lines must not exceed 100 characters
```

### Frontmatter fields

| Field                    | Description                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                   | Skill name. Required in a directory-style `SKILL.md`; in a flat `.md` file the filename is used when omitted. Names are case-insensitive.                                                                                                                |
| `description`            | A one-line summary. The model uses it to decide when to use this skill. Required in a directory-style `SKILL.md`; in a flat `.md` file falls back to the first non-empty line of the body (truncated to 240 characters) when omitted.                    |
| `type`                   | Skill type. Supported values: `prompt` (default), `inline` (same semantics as `prompt`), or `flow` (manual invocation only, not auto-invoked by the model). Other values are skipped.                                                                    |
| `whenToUse`              | Description of the trigger scenario. Aliases `when-to-use` and `when_to_use` are also accepted.                                                                                                                                                          |
| `disableModelInvocation` | Set to `true` to forbid the model from invoking this skill automatically. Aliases `disable-model-invocation` and `disable_model_invocation` are also accepted.                                                                                           |
| `arguments`              | Named arguments the skill accepts. Can be written as an array of strings, or as a single whitespace-separated string (e.g. `arguments: target mode`). Once declared, the body can read them with `$<name>`. Purely numeric or empty entries are ignored. |

::: warning Note
In a directory-style `SKILL.md`, both `name` and `description` **must** be filled in explicitly. Omitting either one causes the skill to fail parsing.
:::

### Body placeholders

The skill body expands a small set of placeholders before being sent to the model:

- `$ARGUMENTS`: the complete raw argument string passed when the skill was invoked
- `$ARGUMENTS[0]`, `$ARGUMENTS[1]`, and shorthand `$0`, `$1`: positional arguments after whitespace splitting, starting at 0
- `$<name>`: a named argument declared in `arguments`
- `${BYF_SKILL_DIR}`: the directory containing the current skill file

Positional arguments respect single- and double-quoted text: in `/skill:commit "fix login" patch`, `$0` expands to `fix login`. If the body does not contain any argument placeholders, the appended text is added to the end of the body as `\n\nARGUMENTS: <text>`.

## Skill locations

BYF scans skills in four scope tiers, with more specific scopes taking higher priority:

**Project > User > Extra > Built-in**

User-level:

- `~/.byf/skills/`
- `~/.agents/skills/`

Project-level (project root = the nearest ancestor directory containing `.git`):

- `.byf/skills/`
- `.agents/skills/`

Extra directories are declared via the top-level `extra_skill_dirs` field in `config.toml`:

```toml
extra_skill_dirs = ["~/team-skills", ".agents/team-skills"]
```

Built-in skills ship with CLI and have the lowest priority.

## Invoking a skill

Users can invoke a skill explicitly with a slash command:

```
/skill:code-style
/skill:git-commits Fix the concurrency issue in the login API
```

The model can also decide to invoke a skill automatically based on `description` and `whenToUse`, unless `disableModelInvocation` is set to `true` or `type` is `flow`. When the model invokes a skill, body placeholders are expanded first, then the content is injected into the system prompt. Skill calls are allowed to nest up to 3 levels deep; deeper invocations are terminated.

## Full example

```markdown
---
name: review-pr
description: Review a pull request against the team's standards and produce a structured review report
type: prompt
whenToUse: When the user asks me to review a PR, inspect code changes, or assess commit quality
arguments:
  - pr_ref
---

Please review the PR specified by the user using the following process: $pr_ref

1. Fetch and read the full diff of `$pr_ref`.
2. Check against the following items one by one:
   - Whether corresponding test cases are included
   - Whether public APIs have documentation updates
   - Whether new dependencies are introduced; if so, explain the rationale
   - Whether error handling covers edge cases
3. Refer to the checklist in the same directory: `references/checklist.md`
4. Produce a review report containing:
   - Overall conclusion (approve / request changes / comment)
   - Required changes (blocking)
   - Suggested improvements (non-blocking)
   - Things worth acknowledging
```

Save the above as `~/.byf/skills/review-pr/SKILL.md`, and put the checklist at `references/checklist.md` in the same directory. Then restart the session, and you can invoke it via `/skill:review-pr #1234`; the appended `#1234` will expand into `$pr_ref` in the body.
