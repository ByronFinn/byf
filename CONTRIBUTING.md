# Contributing to BYF

Thanks for taking the time to contribute. This project moves quickly, and thoughtful community contributions help keep it useful and maintainable.

## Before You Start

BYF already has opinions on CLI/TUI behavior, agent workflows, and public APIs. If your change shifts that direction, open an issue first so we can align before you invest time in a PR.

We hold AI-assisted contributions to the same standard as hand-written ones. **You should understand what you submit** — what changed, how it behaves at the edges, and why it fits this codebase. If you cannot explain that, the PR is not ready for review.

We only merge PRs aligned with the roadmap. Drive-by refactors without context are unlikely to land.

**Discuss first** — open an issue before coding. PRs without prior discussion may be closed without review:

- New features or user-visible behavior changes (regardless of size)
- Refactors or other changes larger than ~100 lines
- Public API or compatibility changes
- Bug fixes where the cause or fix approach is still unclear

**Can open a PR directly** — link an existing issue when there is one:

- Clear, reproducible bug fixes with a focused diff
- Typos, documentation-only changes, and small CI/build fixes
- Small changes that clearly match an existing issue or maintainer request

## Project Layout

This is a Bun monorepo. The most relevant entry points are:

- `apps/cli` — CLI / TUI
- `apps/vis` — session replay and debugging visualizer
- `packages/node-sdk` — public TypeScript SDK (`@byfriends/sdk`)
- `packages/agent-core`, `packages/kosong`, `packages/kaos`, `packages/oauth`, `packages/telemetry` — core engine and supporting packages
- `docs/` — VitePress bilingual docs site

For the full project map, see [AGENTS.md](AGENTS.md).

## Development Setup

Prerequisites: [Bun](https://bun.com) >= 1.3.14, Git. Bun is the only official toolchain for contributing and CI (see [ADR 0028](docs/adr/0028-full-bun-toolchain.md)); Node and pnpm are no longer required.

BYF is developed primarily on macOS and Linux. Windows is supported but on a best-effort basis.

```sh
git clone https://github.com/ByronFinn/byf.git
cd byf
make prepare    # equivalent to `bun install`; also runs the prepare lifecycle (sets git hooks)
```

Useful make targets (run `make help` to see them all):

- `make dev` — run the CLI in dev mode
- `make test` — run tests (bun test)
- `make typecheck` — TypeScript check (note: builds packages first)
- `make lint` — oxlint
- `make fix` — oxlint with auto-fix
- `make build` — build all packages

The Makefile is a thin wrapper around the `bun run` scripts defined in `package.json`; you can always invoke those directly.

## Commit Convention

All commits and PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/).

| Type     | Use for                                   | Example                                |
| -------- | ----------------------------------------- | -------------------------------------- |
| feat     | A new feature                             | feat(agent-core): add tool dedup       |
| fix      | A bug fix                                 | fix(tui): correct status bar alignment |
| docs     | Documentation only                        | docs: clarify install instructions     |
| chore    | Tooling / housekeeping                    | chore: bump dependencies               |
| refactor | Internal refactor without behavior change | refactor(kosong): extract retry helper |
| test     | Adding or improving tests                 | test(agent-core): cover skill resolver |
| ci       | CI / build pipeline changes               | ci: cache bun install                  |
| build    | Build system / artifact changes           | build(native): add win32-arm64 target  |
| perf     | Performance improvement                   | perf(session): batch event flushes     |
| style    | Formatting only (no logic)                | style: apply oxlint --fix              |

PR titles are enforced by the `pr-title-checker` workflow — a non-conforming title will block merge.

## Changesets

This repo uses [changesets](https://github.com/changesets/changesets) to manage versioning and releases.

- Every PR that affects release artifacts (code, behavior, public API) **must** include a changeset.
- Docs-only, test-only, or CI-only PRs may skip changesets.
- Generate one with `make changeset` and follow the prompts (which packages are touched, which bump level).
- For repo-specific conventions on package selection and bump levels, see `.changeset/README.md`. When working in this repo with coding agents, use the `gen-changesets` skill.

### Publishing

Packages are published to npm by the `Release (npm)` workflow, triggered **manually** by a maintainer. Do **not** run bare `npm publish` by hand to ship a release:

- Bare `npm publish` ships the manifest verbatim and leaves workspace-only specifiers (`workspace:`, `catalog:`) in place, which breaks installs for npm users with `EUNSUPPORTEDPROTOCOL`. The release workflow (and local `bun run publish`) pack/validate with Bun (`bun pm pack` / `pubcheck:manifest`) and run `changeset publish` under `scripts/with-publish-manifests.mjs` so protocols and `publishConfig` are rewritten.
- A single manual dispatch of `Release (npm)` runs the quality gates, applies `changeset version`, commits the version bump to `main`, publishes via the wrapper above, and tags each package as `@byfriends/<pkg>@<ver>`. The `@byfriends/cli@*` tag then triggers the binary release workflow.

The standard release path:

1. Accumulate changesets on PRs merged to `main`.
2. When ready to ship, a maintainer runs the `Release (npm)` workflow from the Actions tab.
3. The workflow versions, publishes, and tags; the binary workflow follows the `@byfriends/cli@*` tag.

Before triggering a release you can validate the published layout locally with `make pubcheck` (runs `publint`, `attw`, and a guard against `workspace:`/`catalog:` leaking into packed manifests). See [docs/agents/releasing.md](docs/agents/releasing.md) for the full procedure and emergency manual-release steps.

## Pull Requests

Use the [PR template](.github/pull_request_template.md) when opening a feature pull request.

PR titles must follow [Conventional Commits](#commit-convention); CI runs `bun lint`, `bun typecheck`, and `bun test` on every PR. Update user-facing docs in `docs/` when behavior changes — use the `gen-docs` skill when working with coding agents.

## Code Style

- TypeScript across the codebase.
- Linting via `oxlint` (config in `.oxlintrc.json`).
- Auto-formatting via `make fix`.
- Follow existing local patterns when the lint rules do not cover a style choice.

## Reporting Security Issues

Found a security issue? Please see [SECURITY.md](SECURITY.md) instead of opening a public issue.

## License

By contributing to this repository, you agree that your contributions will be licensed under the [MIT license](LICENSE).
