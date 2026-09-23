/**
 * Whether a compiled binary may ship **without** the embedded web SPA.
 *
 * Pure so the rule is unit-testable without running a multi-second compile
 * (`scripts/lib/release-workflow-shape.test.ts` imports this module).
 *
 * Why the rule exists. `build.mjs` embeds whatever it finds in
 * `apps/web/server/dist/public`, and that directory only exists after
 * `bun run build:web` has run. Before PRD-0038's release review the official
 * pipeline built only `build:packages`, so every shipped binary was produced
 * from an *empty* asset directory — and the old code reacted to that by printing
 * `web SPA assets not found … (byf web will be API-only)` and **exiting 0**. The
 * result: `@byfriends/cli@0.6.1`'s published `linux-x64` binary contains zero
 * embedded SPA assets (verified by grepping the downloaded release artifact for
 * `assets/index-*.js` — 0 hits, only `/$bunfs/root/clipboard…node`), i.e. every
 * user who installed the official binary got an API-only `byf web` / `byf vis`,
 * while CI stayed green because the one job that ever embedded assets
 * (`ci.yml` → `macos-smoke`) reached the compile step through `bun run
 * typecheck`, which builds the SPA as a side effect.
 *
 * A missing workbench UI in a *release* artifact is a product defect, not a
 * build flavour, so the release family (`release`, `bytecode`) hard-fails here.
 * `--profile=local` stays permissive: an unbuilt SPA is normal during
 * development, and a developer iterating on the TUI must not be forced to run
 * vite.
 */

/** Profiles that produce a shipped artifact, and therefore carry its guarantees. */
export const RELEASE_FAMILY_PROFILES = Object.freeze(['release', 'bytecode']);

export function isReleaseFamilyProfile(profile) {
  return RELEASE_FAMILY_PROFILES.includes(profile);
}

/**
 * The command that makes the precondition true. Named in the error text because
 * "assets not found" without a remedy is how this stayed unfixed for a release.
 */
export const SPA_BUILD_COMMAND = 'bun run build:web';
export const SPA_FULL_BUILD_COMMAND = 'bun run build';

/**
 * @param {{ profile: string, assetsFound: boolean, publicDir: string }} input
 * @returns {{ fatal: boolean, message: string }} `fatal` means "abort the build".
 */
export function webAssetEmbeddingPolicy(input) {
  if (input.assetsFound) return { fatal: false, message: '' };

  if (!isReleaseFamilyProfile(input.profile)) {
    return {
      fatal: false,
      message:
        `==> web SPA assets not found at ${input.publicDir} — building WITHOUT the workbench UI.\n` +
        `==> This is allowed for --profile=${input.profile} only. Run \`${SPA_BUILD_COMMAND}\` (or ` +
        `\`${SPA_FULL_BUILD_COMMAND}\`) first if you want \`byf web\` to serve the SPA.`,
    };
  }

  return {
    fatal: true,
    message:
      `RELEASE BUILD ABORTED: no web SPA assets to embed from ${input.publicDir}.\n` +
      `A release-family binary (--profile=release / --profile=bytecode) must embed the workbench\n` +
      `UI; shipping without it produces an API-only \`byf web\` / \`byf vis\` that still exits 0.\n` +
      `Fix the build sequence, do not silence this check:\n` +
      `  1. ${SPA_BUILD_COMMAND}     # builds @byfriends/web-client, then @byfriends/web-server\n` +
      `     (which copies apps/web/client/dist -> apps/web/server/dist/public)\n` +
      `  2. ${SPA_FULL_BUILD_COMMAND}  # the repo's canonical full build, what .github/workflows/release.yml runs\n` +
      `If you are here because a workflow reached compile without a web build, that workflow is the\n` +
      `bug: see scripts/lib/release-workflow-shape.test.ts, which asserts the release pipeline builds\n` +
      `the SPA before it compiles.`,
  };
}
