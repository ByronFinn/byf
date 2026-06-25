---
'@byfriends/cli': minor
---

feat(cli): add `byf vis` subcommand to launch the session visualizer

`byf vis` starts the vis HTTP server in-process and opens it in a browser,
pointing at the local sessions under `$BYF_HOME/sessions`.

- `byf vis` opens the session list; `byf vis <sessionId>` deep-links to a
  specific session (`/sessions/<id>`).
- Flags: `-p/--port` (default 3001), `-H/--host` (default 127.0.0.1),
  `--no-open` to skip the browser.
- Binding a non-loopback host without `VIS_AUTH_TOKEN` exits with a friendly
  hint (incl. an `openssl rand -hex 16` example); a busy port exits with a hint
  to pick another.
- SIGINT/SIGTERM close the server and exit 0; the browser stays open.

`@byfriends/vis-server` is consumed as a published runtime dependency (not
bundled) so its bundled SPA assets stay co-located — see ADR-0021 (revised).
