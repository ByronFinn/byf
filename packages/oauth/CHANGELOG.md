# @byfriends/oauth

## 0.3.6

### Patch Changes

- b7fb767: ci(release): standardize the publish pipeline and guard against workspace:/catalog: leaks

  手动 `npm publish` 不会改写 `workspace:`/`catalog:` 协议,会把它们原样发到
  npm registry,导致 npm 用户安装时报 `EUNSUPPORTEDPROTOCOL`。本次统一发布与校验
  流程,从工具链层面杜绝此类回归:

  - 新增 `scripts/check-published-manifest.mjs`:对每个非私有工作区包 `pnpm pack`,
    解压后检查 `dependencies`/`peerDependencies`/`optionalDependencies` 是否残留
    `workspace:` 或 `catalog:`,有即失败。已接入 `pnpm run publish` 流水线和
    `make pubcheck`。
  - `scripts/attw-pkg.mjs` 的包发现逻辑从写死的 `packages/*` 改为遍历全部发布包,
    `@byfriends/cli`、`@byfriends/vis-server` 现在也被类型导出校验覆盖;纯 bin 应用
    (无 exports/main)会被自动跳过。
  - 新增 `.github/workflows/release-npm.yml`:用 changesets/action 的全自动模式,
    合并 Version Packages PR 后自动发布到 npm 并打 tag,衔接到现有的二进制 release
    流程。CI 中同样运行上述预发布校验。
  - 统一 `publishConfig.provenance: false`(agent-core/kosong/kaos/oauth 对齐已有设置)。
  - `@byfriends/cli` 的 `zod` 依赖改用 `catalog:`,与其余包一致。
  - 新增 `docs/agents/releasing.md` 记录标准发布流程、根因说明和紧急手动发布步骤。

  注意:provenance 与 zod 声明方式的改动不改变运行时行为或公共 API,仅统一发布元数据。

## 0.3.5

### Patch Changes

- chore: align to 0.3.5 and adopt MIT license

  These four packages were left at 0.3.4 when cli/sdk/agent-core were
  bumped to 0.3.5, leaving the publishable set out of sync. They also
  carry the MIT relicense from the 0.3.5 cycle but never got a release
  entry. This changeset brings them to 0.3.5 so the whole published
  surface ships one consistent version.

## 0.3.3

### Patch Changes

- cdd7dbb: chore: enable oxfmt formatting across the monorepo

  Installs oxfmt as a root devDependency and adds `pnpm fmt` / `pnpm fmt:check`
  scripts, with corresponding `make fmt` / `make fmt-check` targets. Integrates
  `oxfmt --write` into lint-staged pre-commit hook and `fmt:check` into the
  publish pipeline. Runs initial formatting on all source files.

## 0.1.2

### Patch Changes

- fix: clear oxlint no-unnecessary-type-assertion warning in provider-config test

## 0.1.1

### Patch Changes

- Release 0.2.1

## 1.0.0

### Major Changes

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

### Minor Changes

- eb5f4fc: Add multi-level reasoning effort support with provider-specific parameter mapping.

  - `@byfriends/cli`: model selector now supports `off/low/medium/high` effort for models exposing `thinking_effort`, with updated runtime state wiring and session model-switch behavior.
  - `@byfriends/oauth`: `/login` model parsing now detects effort-capable models and optional custom effort parameter keys, and writes provider-level `thinking_effort_key` metadata into config.
  - `@byfriends/agent-core`: provider schema/runtime resolution now carries `thinking_effort_key` through to openai-compatible runtime providers.
  - `@byfriends/kosong`: OpenAI-compatible provider now supports configurable thinking effort parameter keys instead of hardcoding `reasoning_effort`.

- b592aeb: Add /login command for custom OpenAI-compatible providers

## 0.1.2

### Patch Changes

- [#52](https://github.com/ByronFinn/byf/pull/52) [`064343a`](https://github.com/ByronFinn/byf/commit/064343a6e565a525fbf38b3a1f70f7ff0235a5ed) - Correct the `X-Msh-Platform` header value to `kimi_code_cli`.

- [#11](https://github.com/ByronFinn/byf/pull/11) [`15b018f`](https://github.com/ByronFinn/byf/commit/15b018fc84a36a9ebde598970e5b44bebe5d68c6) - Surface API-provided error messages during feedback, usage, login, and model setup failures.
