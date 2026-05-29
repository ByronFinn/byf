---
"@byfriends/oauth": major
"@byfriends/sdk": major
"@byfriends/cli": minor
---

Remove Kimi OAuth auth and replace with BYF API-key auth (issue #4, slice 3)

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
