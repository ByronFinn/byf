# @byfriends/cli

## 0.2.0

### Minor Changes

- fa5a6bd: Codebase cleanup: remove dead code, telemetry, legacy artifacts, and align with ADRs (#58)

  - **Remove telemetry package entirely** — delete `packages/telemetry`, remove all telemetry bootstrap from CLI and SDK, keep minimal `noopTelemetryClient` in agent-core
  - **Remove Kaos SSH orphan** — delete `ssh.ts` and all SSH test files, remove ssh2 dependency
  - **Fix kosong wire types** — use `'openai-completions'` in catalog tests, rename `kimi-*` test files
  - **Remove 16 unused imports** across CLI and kosong
  - **Delete dead code** — unused barrel files, already-deleted components confirmed
  - **Clean up skipped tests** — remove 14 disabled test blocks, fix `managed:byf` fixture references
  - **Re-export OAuth through SDK seam** — CLI no longer imports `@byfriends/oauth` directly (ADR 0006)
  - **Extract vis shared types** — vis-web typechecks independently, no longer imports from vis-server source

- 72d2806: Decompose ByfTui into independent, testable modules: add DialogHost interface, extract TranscriptRenderer, SessionMetaHandler, SubagentEventHandler, TurnEventHandler, LoginFlow, ConnectFlow, and TasksBrowserController. ByfTui shrinks from 5623 to 4345 lines. 138 new unit tests added.
- 42d51d8: `/logout` now opens an interactive provider selector instead of requiring a provider name argument. The provider associated with `defaultModel` is highlighted by default, so pressing Enter maintains the previous common-case behavior. The `/disconnect` alias behaves identically. This also fixes a bug where removing the default model's provider would incorrectly clear the active session model even when the current session was using a different provider.

## 0.1.0

### Minor Changes

- eb5f4fc: Add multi-level reasoning effort support with provider-specific parameter mapping.

  - `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
  - `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
  - `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
  - `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.

- 9f7a9d1: Remove Kimi OAuth auth and replace with BYF API-key auth (issue #4, slice 3)

  ### @byfriends/oauth (breaking)

  - Deleted all OAuth device-code flow files: `oauth.ts`, `oauth-manager.ts`,
    `managed-kimi-code.ts`, `managed-usage.ts`, `managed-feedback.ts`,
    `identity.ts`, `constants.ts`, `storage.ts`, `token-state.ts`, `toolkit.ts`
  - The package now only exposes open-platform helpers:
    `fetchOpenPlatformModels`, `applyOpenPlatformConfig`,
    `removeOpenPlatformConfig`, `capabilitiesForModel`, `filterModelsByPrefix`
  - `pollDeviceToken`, `refreshAccessToken`, `requestDeviceAuthorization`,
    `OAuthManager`, `KimiOAuthToolkit`, `FileTokenStorage` are no longer exported

  ### @byfriends/sdk (breaking)

  - Removed OAuth-related types (`OAuthConfig`, `OAuthTokenProviderResolver` public
    re-exports) and OAuth auth-facade helpers
  - Auth now resolves exclusively via API key; OAuth token-provider path is
    preserved internally for backward-compat config migration only
  - Deleted OAuth smoke-test examples (`kimi-harness-auth-smoke.ts`,
    `kimi-harness-config-smoke.ts`)

  ### @byfriends/cli

  - Feedback hint copy updated from `kimi export` → `byf export`
  - Model selector and provider labels reflect BYF branding
  - Startup flow no longer references `auth.kimi.com` or OAuth login dialogs;
    users are directed to `/connect` for provider setup

- b592aeb: Add /login command for custom OpenAI-compatible providers

### Patch Changes

- 8beb53d: Remove remaining upstream Kimi Code brand references (postinstall, flake, build scripts)

  ### @byfriends/cli

  - Replaced the postinstall hook (`scripts/postinstall.mjs`) with a deliberate
    no-op. The previous hook was a full Kimi-to-BYF CLI migration script that
    probed PATH for a Python `kimi-cli` installation and renamed/removed its
    shim. BYF has no Python predecessor, so every global install would have run
    irrelevant migration logic and printed "kimi now runs the new version" to the
    user. The script now exits silently; future first-install UX (PATH
    reachability check etc.) can be added without any upstream baggage.
  - Deleted the three submodule files (`scripts/postinstall/migrate.mjs`,
    `reach.mjs`, `ui.mjs`) and removed `"scripts/postinstall"` from the `files`
    array in `package.json`.
  - `scripts/native/build.mjs`: error message updated from
    "Kimi Code native SEA build requires…" to "BYF native SEA build requires…".
  - `flake.nix`: fully rebranded — description, derivation names (`kimi-code` →
    `byf`, `kimi-code-pnpm-deps` → `byf-pnpm-deps`), package paths
    (`apps/kimi-code` → `apps/cli`), binary name (`kimi` → `byf`), env-var name
    (`KIMI_CODE_BUILD_TARGET` → `BYF_CODE_BUILD_TARGET`), meta fields (homepage,
    license `mit` → `unfree`, `mainProgram`), and the `update-pnpm-deps` helper
    script.

- 8beb53d: Remove dead code and stale Kimi brand artifacts

  ### @byfriends/telemetry

  - Removed unused optional fields from `AsyncTransportOptions`: `endpoint`,
    `getAccessToken`, `fetchImpl`, `retryBackoffsMs`, `requestTimeoutMs`,
    `sleep`, `now`. These options were never read by the constructor after the
    HTTP-send path was stripped; passing them had no effect.
  - Removed the exported `RETRY_BACKOFFS_MS` constant and `TransientTelemetryError`
    class, which had no production callers.
  - Removed `getAccessToken` from `TelemetryBootstrapOptions`; the CLI never
    passed it and `initializeTelemetry` forwarded it to an option the transport
    silently ignored.
  - Updated tests to reflect the slimmed-down interface.

  ### @byfriends/cli

  - Deleted the `DeviceCodeBoxComponent` TUI component and its test. The
    OAuth device-code flow was removed in slice 3; the component was exported
    but never instantiated in the TUI runtime.
  - Updated `.gitignore`: `.kimi-stash-dir` → `.byf-stash-dir`.
  - Updated `apps/cli/.gitignore` comment: `packages/kimi-core` → `packages/agent-core`.

## 0.2.0

### Minor Changes

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - Add a `/connect` command that configures a provider and model from a model catalog.

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - The `/connect` provider and model pickers now support type-to-search filtering, and long lists are paginated. The `/model` picker is also paginated when many models are configured.

- [#25](https://github.com/ByronFinn/byf/pull/25) [`c4dd1c7`](https://github.com/ByronFinn/byf/commit/c4dd1c7ff298290ee17d4a6676f93284621f32e8) - Flatten tool call data by inlining tool names and arguments at the top level, and limit legacy record migration so it only rewrites matching tool call payloads.

### Patch Changes

- [#9](https://github.com/ByronFinn/byf/pull/9) [`e503e69`](https://github.com/ByronFinn/byf/commit/e503e6963ab6cc6b4ed98c89389dbbb525fc6e9e) - Add `Ctrl-J` as an additional shortcut for inserting new lines in the TUI prompt.

- [#22](https://github.com/ByronFinn/byf/pull/22) [`2004aed`](https://github.com/ByronFinn/byf/commit/2004aedfe1d4e5e17762108bf48b7b9aa6d4e25b) - Add wire record migration handling during session replay.

- [#33](https://github.com/ByronFinn/byf/pull/33) [`ab4bd09`](https://github.com/ByronFinn/byf/commit/ab4bd090825cffbd7ab656b47840b0060d6cf601) - Report the macOS product version in OAuth device information instead of the Darwin kernel version.

- [#52](https://github.com/ByronFinn/byf/pull/52) [`064343a`](https://github.com/ByronFinn/byf/commit/064343a6e565a525fbf38b3a1f70f7ff0235a5ed) - Correct the `X-Msh-Platform` header value to `kimi_code_cli`.

- [#38](https://github.com/ByronFinn/byf/pull/38) [`e9e4a48`](https://github.com/ByronFinn/byf/commit/e9e4a48633f2d216672e8905b0235107b5cbe34a) - Clarify the prompt-mode error when no model is configured by pointing users to the login flow.

- [#13](https://github.com/ByronFinn/byf/pull/13) [`35726d7`](https://github.com/ByronFinn/byf/commit/35726d7a41d54a0e6cb19a21d16980fd462132e1) - Hide the empty current session from the sessions picker while keeping other empty sessions visible.

- [#31](https://github.com/ByronFinn/byf/pull/31) [`475ebad`](https://github.com/ByronFinn/byf/commit/475ebadc2070e3b878789f6a89ce191b1bd957a9) - Stop mentioning OAuth credentials in the migration UI — they are never migrated, so the previous "needs /login" notice misread as a failure. OAuth-only installs no longer trigger the migration screen.

- [#31](https://github.com/ByronFinn/byf/pull/31) [`475ebad`](https://github.com/ByronFinn/byf/commit/475ebadc2070e3b878789f6a89ce191b1bd957a9) - Migrate user skills from `~/.kimi/skills/` to `~/.kimi-code/skills/` during the first-launch migration; existing target skills are kept.

- [#30](https://github.com/ByronFinn/byf/pull/30) [`a200a29`](https://github.com/ByronFinn/byf/commit/a200a297ac8986ec4baa8d2cdc881ef71bc3abfc) - When no models are configured, `/model` and the welcome panel now point users to `/login` (for Kimi) and `/connect` (for other providers).

- [#11](https://github.com/ByronFinn/byf/pull/11) [`15b018f`](https://github.com/ByronFinn/byf/commit/15b018fc84a36a9ebde598970e5b44bebe5d68c6) - Surface API-provided error messages during feedback, usage, login, and model setup failures.

- [#24](https://github.com/ByronFinn/byf/pull/24) [`7858821`](https://github.com/ByronFinn/byf/commit/7858821f2f1fecc9de666780fc62434ca76dcc82) - Persist model selections from the terminal UI to the default configuration, and honor the configured default thinking state for new sessions.

- [#14](https://github.com/ByronFinn/byf/pull/14) [`0da6073`](https://github.com/ByronFinn/byf/commit/0da60730b9716c39a07e8a3a0a320e3af7ad30fa) - Move wire metadata handling into the record layer and keep persistence backends limited to storage operations.

- [#12](https://github.com/ByronFinn/byf/pull/12) [`89ea895`](https://github.com/ByronFinn/byf/commit/89ea8959eb9419d04e63645b4d89ca0e33f20d98) - Retry compaction responses that do not contain a summary before updating conversation history.

- [#29](https://github.com/ByronFinn/byf/pull/29) [`df7a9ca`](https://github.com/ByronFinn/byf/commit/df7a9cab606e0f152bc45b1d1645d76210b1e0c4) - Avoid CPU spikes from large streamed tool arguments and coalesce high-frequency streaming UI updates.

- [#47](https://github.com/ByronFinn/byf/pull/47) [`07ed2cf`](https://github.com/ByronFinn/byf/commit/07ed2cf9d4f01985c00c004b3bc0cc8d2587044b) - Emit session resume hint as a structured meta message in stream-json output format.

- [#49](https://github.com/ByronFinn/byf/pull/49) [`cf2227e`](https://github.com/ByronFinn/byf/commit/cf2227e8a5222ad9bd1167b573b62599d0efd906) - Resume sessions with a newer wire protocol version instead of failing. A warning is now shown in the TUI and records are replayed without migration.

- [#18](https://github.com/ByronFinn/byf/pull/18) [`a964bd2`](https://github.com/ByronFinn/byf/commit/a964bd2430a583ff0364fde19eafabda03b489ed) - Warn tmux users when extended key settings may prevent modified Enter shortcuts from working.

- [#17](https://github.com/ByronFinn/byf/pull/17) [`bfbd522`](https://github.com/ByronFinn/byf/commit/bfbd522a7160e597d673550f09fd4af089bfde34) - Let Kimi requests use the remaining context window for completion tokens by default while keeping explicit environment limits as hard caps.
