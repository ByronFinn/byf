# Context: BYF (Be Your Friend)

An AI coding agent that runs in the terminal. Originally forked from Kimi Code (by Moonshot AI), now an independent product.

## Glossary

### BYF
The product name. Short for "Be Your Friend". An AI coding agent that runs in the terminal.

### Upstream
The original Kimi Code project by Moonshot AI (`ByronFinn/byf` on GitHub). BYF was forked from this codebase but is now fully independent.

## Fork Strategy: Full Independence
BYF is a hard fork. No future merges or cherry-picks from upstream. All upstream references (Moonshot AI, Kimi) will be completely removed from the codebase.

## License Terms
- Users may copy and redistribute unmodified BYF software
- Local modification for personal use is allowed
- Redistribution of modified versions is prohibited
- Commercial use is prohibited
- Source code is publicly visible on GitHub (source-available, not open source)

## Glossary

### Provider
A named API endpoint configured by the user. Each provider has a user-chosen name (e.g. "deepseek"), a `type` (e.g. `openai-completions`, `anthropic`, `google-genai`), a `base_url`, an `api_key`, and an optional `allowedPrefixes` for model filtering. Stored in config under `providers[name]`.

### openai-completions
The unified provider type for any OpenAI Chat Completions-compatible API (OpenAI, DeepSeek, Ollama, etc.). Replaces the former `openai` and `openai-compat` types. _Avoid_: openai (deprecated), openai-compat (deprecated).

### Catalog Provider
A well-known provider (OpenAI, Anthropic, etc.) configured through `/connect`, which fetches metadata from the models.dev catalog. Distinct from user-configured providers from `/login`.

### /login
CLI command to add a custom OpenAI-compatible provider. Flow: name → base_url → api_key → select model. Supports multiple providers.

### /connect
CLI command to configure a catalog provider from models.dev. Complements `/login`.

### /logout
CLI command to remove a specific provider by name: `/logout <name>`.

### Plan Mode
A planning state where the agent focuses on investigation and planning before implementation, with stricter write boundaries than normal execution mode.

### Plan Target Path
The stable path shown when Plan Mode is entered, indicating where the plan artifact is intended to be written if planning content is actually produced.

### Plan Artifact
The persisted plan markdown file. It is considered materialized only after the first actual write, not merely by entering Plan Mode.

## Renaming Map

| Aspect | Upstream Value | BYF Value |
|--------|---------------|-----------|
| Product name | Kimi Code | BYF (Be Your Friend) |
| Product description | "Kimi Code is an AI coding agent..." | "BYF (Be Your Friend) is an AI coding agent..." |
| CLI command | `kimi` | `byf` |
| NPM scope | `@moonshot-ai` | `@byf` |
| NPM main package | `@byfriends/cli` | `@byfriends/cli` |
| NPM SDK | `@byfriends/sdk` | `@byfriends/sdk` |
| NPM OAuth | `@byfriends/oauth` | `@byfriends/oauth` |
| NPM telemetry | `@byfriends/telemetry` | `@byfriends/telemetry` |
| NPM agent-core | `@byfriends/agent-core` | `@byfriends/agent-core` |
| NPM kosong | `@byfriends/kosong` | `@byfriends/kosong` |
| NPM kaos | `@byfriends/kaos` | `@byfriends/kaos` |
| NPM vis | `@byfriends/vis` | `@byfriends/vis` |
| NPM monorepo | `@byfriends/monorepo` | `@byfriends/monorepo` |
| Docs package | `byf-docs` | `byf-docs` |
| App directory | `apps/cli/` | `apps/cli/` |
| Data dir | `.kimi-code` | `.byf` |
| Home env var | `KIMI_CODE_HOME` | `BYF_HOME` |
| CDN / Install | `code.kimi.com` CDN | GitHub Releases |
| Feedback URL | `ByronFinn/byf/issues` | `ByronFinn/byf/issues` |
| Docs site | `moonshotai.github.io/kimi-code` | README only for now |
| Telemetry | Kimi backend | Removed entirely |
| OAuth provider | `managed:kimi-code` | User-configured via `/login` |
| migration-legacy pkg | `@byfriends/migration-legacy` | Deleted |
| Version | `0.2.0` | `0.0.1` |
| GitHub repo | `ByronFinn/byf` | `ByronFinn/byf` |
| License | MIT | Proprietary |
