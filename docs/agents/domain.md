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
│   │   └── …                   ← representative samples; see docs/prd/ for the current full set
│   ├── adr/
│   │   ├── 0002-user-configurable-providers.md
│   │   ├── 0003-lazy-plan-artifact-materialization.md
│   │   └── …                   ← representative samples; see docs/adr/ for the current full set
│   └── research/
│       └── INDEX.md            ← searchable stack × topic × major index; records live alongside
└── src/
```

The tree shows representative entries only — PRD and ADR sets keep growing, so always read the live `docs/prd/` and `docs/adr/` directories for the current full set. `docs/research/` is created lazily by `/research`.

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
