---
"@byfriends/cli": minor
---

`/logout` now opens an interactive provider selector instead of requiring a provider name argument. The provider associated with `defaultModel` is highlighted by default, so pressing Enter maintains the previous common-case behavior. The `/disconnect` alias behaves identically. This also fixes a bug where removing the default model's provider would incorrectly clear the active session model even when the current session was using a different provider.
