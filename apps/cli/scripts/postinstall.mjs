#!/usr/bin/env node
/**
 * Postinstall hook for @byfriends/cli.
 *
 * BYF has no predecessor CLI to migrate from. This script is a
 * deliberate no-op: it exists so npm/pnpm/yarn do not error on
 * `scripts.postinstall`, and can be extended with BYF-specific
 * first-install behaviour (e.g. PATH reachability check) in the
 * future.
 *
 * Rules:
 *   - Never fails the install. Always exits 0.
 *   - Non-global installs (npx, local deps, workspace bootstraps)
 *     are silent no-ops.
 */
