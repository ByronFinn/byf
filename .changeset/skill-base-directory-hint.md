---
'@byfriends/agent-core': patch
---

fix(skill): surface the skill base directory in the rendered prompt

`SkillRegistry.renderSkillPrompt` injected the `SKILL.md` body into the
prompt as raw text, without telling the model where the skill was
installed. `skill.dir` (an absolute path) was already known to the
engine but dropped at render time, so skills that reference sibling
files via relative paths — `references/*.md`, `../rules/*.md`,
`REFERENCE.md` — could not be resolved.

The model was forced to guess the base directory from the project cwd
plus the `.skills/` convention. This happened to work for project-level
installs but broke for global installs (e.g. `~/.agents/skills/`): the
model read `.skills/<name>/references/foo.md` relative to the project,
which does not exist, and the skill failed (e.g. `/write` in a project
without `.skills/`).

The rendered prompt is now prefixed with two deterministic lines that
state the absolute base directory and that relative paths resolve
against it. The opt-in `${BYF_SKILL_DIR}` placeholder substitution is
unaffected and remains available for skills that want inline absolute
paths. No public API change; the only observable difference is the
extra header in the skill content sent to the model.
