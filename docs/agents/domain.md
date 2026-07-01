# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — domain glossary (core concepts, terminology, relationships)
- **`CONTEXT-MAP.md`** at the root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/prd/`** — product requirements documents. Skills like `improve-architecture` and `review` read these for planned features and acceptance criteria.
- **`docs/adr/`** — architecture decision records. Read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.
- **`docs/research/INDEX.md`** — searchable index of persisted technical research records (stack × topic × major). `/think` Step 5 queries it before re-searching; `/research` produces records here.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skills (`/grill` for CONTEXT.md and ADRs, `/think` or `/story` for PRDs) create them lazily.

## What to do if files are missing

If `CONTEXT.md` doesn't exist yet, consumer skills should proceed without it. The first run of `/grill` will create it lazily. Do not create an empty `CONTEXT.md` during setup — an empty file is noise.

Same for `docs/prd/`, `docs/adr/`, and `docs/research/` — create them only when there's actual content to write.

## File structure

Single-context repo:

```
/
├── CONTEXT.md
├── docs/
│   ├── prd/
│   │   ├── PRD-0002-login-api-type-selector.md
│   │   ├── PRD-0003-foreground-subagent-live-viewer.md
│   │   ├── PRD-0004-agent-records-restoration-refactoring.md
│   │   ├── PRD-0005-approval-fullscreen-viewer.md
│   │   ├── PRD-0006-ephemeral-injection-cache-optimization.md
│   │   ├── PRD-0007-cache-observability-cli.md
│   │   ├── PRD-0008-design-debt-cleanup-high-priority.md
│   │   ├── PRD-0010-user-configurable-providers.md
│   │   ├── PRD-0011-turn-boundary-cache-staking.md
│   │   ├── PRD-0012-websearch-multi-provider.md
│   │   ├── PRD-0013-update-config-command.md
│   │   ├── PRD-0014-legacy-sse-mcp-transport.md
│   │   ├── PRD-0015-fork-step-rewind.md
│   │   ├── PRD-0016-btw-side-query.md
│   │   └── PRD-0017-byf-vis-command.md
│   └── adr/
│       ├── 0002-user-configurable-providers.md
│       ├── 0003-lazy-plan-artifact-materialization.md
│       ├── 0004-merge-openai-providers.md
│       ├── 0005-thinking-effort-validation-and-clamping.md
│       ├── 0006-monorepo-layered-architecture.md
│       ├── 0007-approval-display-silent-transition.md
│       ├── 0008-remove-plan-mode.md
│       ├── 0009-context-minimization-strategy.md
│       ├── 0010-agent-records-restoration-refactoring.md
│       ├── 0011-turn-boundary-cache-staking.md
│       ├── 0012-login-catalog-enrichment.md
│       ├── 0013-remove-directory-tree-injection.md
│       ├── 0014-task-entry-discriminated-union.md
│       ├── 0015-base-chat-provider.md
│       ├── 0016-login-multi-type-providers.md
│       ├── 0017-decompose-byf-tui.md
│       ├── 0018-websearch-multi-provider.md
│       ├── 0019-update-config-as-skill.md
│       ├── 0020-fork-rewind-truncation-anchor.md
│       └── 0021-embed-vis-server-into-cli.md
└── src/
```

The `docs/research/` branch is omitted because it does not exist yet; `/research` will create it lazily.

**File naming conventions** (producer skills define these; consumer skills read them):

- PRD: `PRD-NNNN-<title>.md` — see `PRD-FORMAT.md` (dev-skills /think)
- ADR: `<NNNN>-<title>.md` (no `ADR-` prefix) — see `ADR-FORMAT.md` (dev-skills /grill)
- Research: `<stack>-<topic>-<major>.md` — see `RESEARCH-FORMAT.md` (dev-skills /research)

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/
│   ├── prd/                           ← shared PRDs
│   └── adr/                           ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
