# @byfriends/telemetry

## 0.0.2

### Patch Changes

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
