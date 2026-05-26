# PRD: Rebrand Kimi Code to BYF

## Problem Statement

BYF is currently a fork of Kimi Code that still carries all upstream branding — Moonshot AI organization scope, Kimi product name, upstream CDN/OAuth/telemetry infrastructure, and MIT license. A user running the code today would see "Kimi Code" everywhere and be routed to Moonshot AI services. The project needs to become its own independent product called BYF (Be Your Friend).

## Solution

Strip all upstream identity and infrastructure dependencies from the codebase, rebrand everything to BYF under the `@byf` NPM scope, replace upstream services (OAuth, telemetry, CDN) with self-contained alternatives, and apply a proprietary license. The result is a fully independent product with no runtime dependency on Moonshot AI infrastructure.

## User Stories

### Branding & Identity

1. As a user, I want to install the CLI via `npm install -g @byf/cli`, so that the package name matches the product
2. As a user, I want to run `byf` in my terminal to start the agent, so that the command name matches the product name
3. As a user, I want all UI text to say "BYF" instead of "Kimi Code", so that I know what product I'm using
4. As a user, I want version output to show "BYF v0.0.1" instead of "Kimi Code", so that I can identify the product
5. As a user, I want the user-agent string to identify as `byf-cli` in HTTP requests, so that network tools show the correct product
6. As a user, I want error messages to reference "BYF" and `ByronFinn/byf/issues`, so that I know where to report bugs

### Configuration & Data

7. As a user, I want my data stored in `~/.byf/` instead of `~/.kimi-code/`, so that BYF data is isolated from any prior Kimi Code installation
8. As a user, I want to configure BYF's data directory via `BYF_HOME` environment variable, so that I can customize where my data lives
9. As a user, I want to provide my own API key for LLM providers, so that I can use BYF without a managed auth service

### Installation & Distribution

10. As a user, I want to download BYF install scripts from GitHub Releases, so that I can install without depending on Moonshot AI's CDN
11. As a user, I want the install script to detect my platform and download the correct binary, so that installation works on macOS, Linux, and Windows
12. As a user, I want to see the source code on `github.com/ByronFinn/byf`, so that I can read, learn from, and locally modify the code

### Licensing

13. As a user, I want to see a clear LICENSE file that tells me I can share unmodified copies of BYF, so that I know my redistribution rights
14. As a user, I want the license to clarify that local modification for personal use is allowed, so that I can customize my own setup
15. As a user, I want the license to clearly state that redistribution of modified versions is prohibited, so that the product identity is protected
16. As a user, I want the license to clearly state that commercial use is prohibited, so that I understand the usage boundaries

### Developer Experience

17. As a contributor, I want all workspace packages to use the `@byf` scope, so that imports are consistent and branded
18. As a contributor, I want the main app directory to be `apps/cli/` instead of `apps/kimi-code/`, so that directory names match the package name
19. As a contributor, I want `pnpm dev` to work correctly after rebranding, so that the development workflow is unchanged
20. As a contributor, I want all tests to pass after rebranding, so that I can verify nothing is broken
21. As a contributor, I want no references to "moonshot", "kimi", or "KIMI_CODE" remaining in source code, so that the rebranding is complete

### Cleanup

22. As a user, I do NOT want the legacy migration tool bundled, since I have no prior installation to migrate from
23. As a user, I do NOT want telemetry code sending data anywhere, so that my usage is private
24. As a user, I do NOT want OAuth code connecting to `auth.kimi.com`, so that no traffic goes to Moonshot AI servers

## Implementation Decisions

### Module 1: Constants & App Identity

**What changes:** The main branding constants file and all its consumers.

The central constants file will be updated:
- `PRODUCT_NAME` → `'BYF'`
- `CLI_COMMAND_NAME` → `'byf'`
- `CLI_USER_AGENT_PRODUCT` → `'byf-cli'`
- `NPM_PACKAGE_NAME` → `'@byf/cli'`
- `*_HOME_ENV` → `'BYF_HOME'`
- `*_DATA_DIR_NAME` → `'.byf'`
- CDN URLs → GitHub Releases URLs under `ByronFinn/byf`
- `FEEDBACK_ISSUE_URL` → `'https://github.com/ByronFinn/byf/issues'`
- `FEEDBACK_VERSION_PREFIX` → `'byf-'`

All files importing these constants will pick up the new values automatically.

### Module 2: Package Identity

**What changes:** All `package.json` files in the monorepo.

Package scope changes from `@moonshot-ai` to `@byf`:
- `@moonshot-ai/kimi-code` → `@byf/cli`
- `@moonshot-ai/kimi-code-sdk` → `@byf/sdk`
- `@moonshot-ai/kimi-code-oauth` → `@byf/oauth`
- `@moonshot-ai/kimi-telemetry` → `@byf/telemetry`
- `@moonshot-ai/agent-core` → `@byf/agent-core`
- `@moonshot-ai/kosong` → `@byf/kosong`
- `@moonshot-ai/kaos` → `@byf/kaos`
- `@moonshot-ai/vis` → `@byf/vis`
- `@moonshot-ai/monorepo` → `@byf/monorepo`
- `kimi-code-docs` → `byf-docs`

The CLI binary entry point changes from `"kimi": "dist/main.mjs"` to `"byf": "dist/main.mjs"`.

All inter-package dependency references in each `package.json` must be updated to use the new scope.

### Module 3: Auth Simplification

**What changes:** The OAuth package and SDK auth layer.

The managed OAuth flow (`managed:kimi-code` provider connecting to `auth.kimi.com`) will be removed. The auth system will be simplified to accept user-provided API keys for LLM providers. The OAuth package itself may be kept as a shell (for future auth needs) or removed entirely depending on how deeply it's wired into the SDK.

The SDK's `auth.ts` module will be updated to remove Kimi-specific provider names and default to API-key-based authentication.

### Module 4: Telemetry Removal

**What changes:** The telemetry package and all its consumers.

The `packages/telemetry/` module will be gutted — all outbound reporting calls removed, all event emission code removed. The package may be kept as an empty shell to avoid breaking import chains, or removed entirely if the dependency graph allows it.

All calls to telemetry functions throughout the codebase will be removed.

### Module 5: Provider Rebranding

**What changes:** Kimi-specific LLM provider implementations in `packages/kosong/`.

The Kimi provider (`kimi.ts`, `kimi-schema.ts`, `kimi-files.ts`) uses Moonshot AI API endpoints (`api.moonshot.ai`). These will be evaluated:
- If the provider supports generic OpenAI-compatible endpoints, it will be rebranded to use user-configurable base URLs
- The provider name and internal references will change from "kimi" to a generic name
- Moonshot-specific tool providers (`moonshot-fetch-url.ts`, `moonshot-web-search.ts`) in agent-core will be removed or made configurable

### Module 6: Migration Legacy Deletion

**What changes:** Remove `packages/migration-legacy/` entirely.

This package migrates data from `~/.kimi/` to `~/.kimi-code/` — both paths are irrelevant to BYF. The package will be deleted and its workspace dependency in the main CLI app removed.

### Module 7: Config & Path Module

**What changes:** Path resolution and config schema in `packages/agent-core/` and `packages/node-sdk/`.

- `KIMI_CODE_HOME` env var references → `BYF_HOME`
- Config file paths using `.kimi-code` → `.byf`
- Config schema fields referencing Kimi-specific defaults → BYF defaults

### Module 8: Documentation & Metadata

**What changes:** All prose files visible to users and contributors.

- `README.md` and `README.zh-CN.md` — Full rewrite of product name, descriptions, installation instructions, URLs
- `CONTRIBUTING.md` — Update references from "kimi-code" to "byf"
- `SECURITY.md` — Update security contact from Moonshot AI to ByronFinn
- `AGENTS.md` files — Update all project references
- `LICENSE` — Replace MIT with proprietary license text
- All `package.json` `description` and `keywords` fields

### Module 9: Directory Restructure

**What changes:** Rename `apps/kimi-code/` to `apps/cli/`.

This requires updating:
- `pnpm-workspace.yaml` if it references the directory explicitly
- Root `package.json` scripts that reference `apps/kimi-code`
- `Makefile` targets
- Any relative import paths from other workspace packages

### Module 10: Build & Install Scripts

**What changes:** Installation and distribution mechanism.

CDN-based install URLs will be replaced with GitHub Releases URLs. The update checker will point to GitHub Releases API instead of `code.kimi.com`. Install scripts (`install.sh`, `install.ps1`) will be rewritten to pull from `github.com/ByronFinn/byf/releases`.

## Testing Decisions

### What makes a good test
Tests should verify external behavior, not implementation details. For this rebranding, the key testable behaviors are:
- The CLI binary runs with the correct command name
- Version output shows "BYF" and the correct version
- Data paths resolve to `.byf` directories
- Config correctly reads `BYF_HOME` env var
- User-agent strings contain "byf-cli"
- No outbound network calls to `kimi.com` or `moonshot.ai` domains

### Modules to test
- **Constants module** — Verify all constants have correct BYF values (smoke test)
- **Config/path module** — Verify path resolution uses `BYF_HOME` and `.byf`
- **Auth module** — Verify API-key-based auth works, no OAuth flow remains
- **Build output** — Verify the binary entry point is named `byf`

### Prior art
Existing tests in the codebase use Vitest. The test patterns already present (mocking, snapshot testing, integration tests) should be followed.

## Out of Scope

- **Documentation site** — No VitePress site; README only for now
- **Kimi provider removal** — The underlying LLM provider code may still support Moonshot AI as an endpoint, but it won't be the default or branded as "Kimi"
- **Upstream sync** — No mechanism to merge upstream changes
- **npm publishing** — Publishing `@byf/*` packages to npm is a separate concern
- **GitHub Actions / CI** — CI pipeline updates are separate
- **New features** — This is purely a rebranding and cleanup effort
- **vis app** — The visualization app gets scope/name updates but no functional changes

## Further Notes

- This is a large, cross-cutting change. It should be executed as a single atomic commit (or a short series of commits on a dedicated branch) to avoid leaving the codebase in a half-branded state.
- After rebranding, a search for "kimi", "moonshot", "KIMI_CODE" should return zero results in source files (excluding lockfile hashes and git history).
- The proprietary license text needs to be drafted. It should be a simple, clear document — not legalese-heavy — that covers: redistribution of unmodified copies allowed, local modification allowed, redistribution of modifications prohibited, commercial use prohibited.
