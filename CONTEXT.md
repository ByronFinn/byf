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

## Renaming Map

| Aspect | Upstream Value | BYF Value |
|--------|---------------|-----------|
| Product name | Kimi Code | BYF (Be Your Friend) |
| Product description | "Kimi Code is an AI coding agent..." | "BYF (Be Your Friend) is an AI coding agent..." |
| CLI command | `kimi` | `byf` |
| NPM scope | `@moonshot-ai` | `@byf` |
| NPM main package | `@byf/cli` | `@byf/cli` |
| NPM SDK | `@byf/sdk` | `@byf/sdk` |
| NPM OAuth | `@byf/oauth` | `@byf/oauth` |
| NPM telemetry | `@byf/telemetry` | `@byf/telemetry` |
| NPM agent-core | `@byf/agent-core` | `@byf/agent-core` |
| NPM kosong | `@byf/kosong` | `@byf/kosong` |
| NPM kaos | `@byf/kaos` | `@byf/kaos` |
| NPM vis | `@byf/vis` | `@byf/vis` |
| NPM monorepo | `@byf/monorepo` | `@byf/monorepo` |
| Docs package | `byf-docs` | `byf-docs` |
| App directory | `apps/cli/` | `apps/cli/` |
| Data dir | `.kimi-code` | `.byf` |
| Home env var | `KIMI_CODE_HOME` | `BYF_HOME` |
| CDN / Install | `code.kimi.com` CDN | GitHub Releases |
| Feedback URL | `ByronFinn/byf/issues` | `ByronFinn/byf/issues` |
| Docs site | `moonshotai.github.io/kimi-code` | README only for now |
| Telemetry | Kimi backend | Removed entirely |
| OAuth provider | `managed:kimi-code` | None (user-provided API key) |
| migration-legacy pkg | `@byf/migration-legacy` | Deleted |
| Version | `0.2.0` | `0.0.1` |
| GitHub repo | `ByronFinn/byf` | `ByronFinn/byf` |
| License | MIT | Proprietary |
