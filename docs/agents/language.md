# Documentation Language

The language engineering skills should write **human-facing output** in for this repo.

## Language

**简体中文 (Simplified Chinese)**

All prose produced by skills — PRDs (`docs/prd/`), ADRs (`docs/adr/`), `CONTEXT.md`, issue titles and bodies, review reports, and comments — is written in this language.

## Scope

- **In scope**: human-facing prose in documents and issues.
- **Out of scope**: code, identifiers, file names, CLI commands, and configuration values. These follow code conventions, never this setting.

## When a skill says "write the output"

Write the prose in the language above. Do not silently switch to the conversation's language — the team reads the configured language, which may differ from whoever triggered the skill.

If a single artifact genuinely needs a second language (e.g. a bilingual release note), the producing skill may deviate, but the configured language is always the primary one.

## If this file is missing

Fall back to the user's input language, and ask which language the team prefers so it can be recorded here. Don't keep guessing every session.
