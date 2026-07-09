# Migrating from legacy CLI

BYF is the next-generation terminal agent — and a fresh start. If you have been using the previous generation, legacy CLI, you don't need to start over: a single command brings your configuration, MCP servers, and session history across to the new version.

## Why migrate

byf no longer depends on Python or the `uv` toolchain, making installation and upgrades simpler. It ships native compile binaries out of the box (GitHub Release or npm optionalDependencies) — end users do not need to preinstall Bun or Node to run the CLI.

The terminal UI has been redesigned for a faster and lighter experience.

legacy CLI is transitioning to byf, and migrating lets you keep your existing configuration and session history going forward.

## How to migrate

There are two ways to migrate.

The **first time you run `byf`** after installing byf, it automatically checks whether legacy CLI data exists under `~/.byf/`. If it finds any, a migration prompt appears, and you can choose to migrate now, do it later, or never be asked again.

You can also **run it manually at any time**:

```sh
byf migrate
```

You can choose whether to migrate chat sessions as well. If you don't need the history yet, pick **Config only**; otherwise pick **Config + N sessions** to bring everything across in one go. A summary is printed at the end.

## What happens during migration

**What gets migrated**: configuration (`config.toml`), MCP server configuration, input history, and whichever chat sessions you chose to migrate.

**What does not get migrated**: OAuth login credentials and MCP service authorizations are not copied, so you will need to run `/login` again and re-authorize MCP servers after migrating. legacy CLI plugins are also out of scope.

::: tip
Migration **never modifies or deletes** any of the old data under `~/.byf/`. legacy CLI keeps working as before, and the two do not interfere with each other. Migration can also be run repeatedly — sessions that have already been migrated are not imported again.
:::

After migration, sessions imported from legacy CLI are tagged with `[imported]` in the session picker so you can tell them apart from new ones.
