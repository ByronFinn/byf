/**
 * Optional native clipboard binding.
 *
 * `@mariozechner/clipboard` is a native Node binding that can read image
 * binaries from the system clipboard on macOS and Windows. It's an
 * optional dependency — if the native module fails to load (e.g. on a
 * platform where no prebuilt is available) we degrade to shell-based
 * fallbacks (wl-paste / xclip / PowerShell) in `clipboard-image.ts`.
 */

import { createRequire } from 'node:module';

import { loadNativePackage } from '#/native/native-require';
import { isBunStandaloneExecutable } from '#/native/standalone';

declare const __BYF_CODE_NATIVE_BUNDLE__: boolean | undefined;

export interface ClipboardModule {
  availableFormats?(): string[];
  hasText?(): boolean;
  getText?(): Promise<string>;
  hasImage(): boolean;
  getImageBinary(): Promise<Array<number>>;
}

const nodeRequire = createRequire(import.meta.url);
const isNativeBundle =
  typeof __BYF_CODE_NATIVE_BUNDLE__ === 'boolean' && __BYF_CODE_NATIVE_BUNDLE__;

// The native module uses X11/Wayland on Linux; if no display is
// available, skip the load attempt so headless environments don't pay
// the binding cost just to fail later.
const hasDisplay =
  process.platform !== 'linux' || Boolean(process.env['DISPLAY'] ?? process.env['WAYLAND_DISPLAY']);

const clipboard: ClipboardModule | null = (() => {
  if (process.env['TERMUX_VERSION'] !== undefined || !hasDisplay) return null;
  try {
    // Legacy SEA: extract embedded assets via native-assets tree if present.
    const bundledClipboard = loadNativePackage<ClipboardModule>('@mariozechner/clipboard');
    if (bundledClipboard !== null) return bundledClipboard;
  } catch {
    return null;
  }
  // Packaged native without Bun standalone / embedded package: fail closed.
  // Bun compile embeds N-API `.node` via `import … with { type: "file" }` and
  // sets NAPI_RS_NATIVE_LIBRARY_PATH to the /$bunfs path (see scripts/compile/build.mjs).
  if (isNativeBundle && !isBunStandaloneExecutable()) return null;
  try {
    return nodeRequire('@mariozechner/clipboard') as ClipboardModule;
  } catch {
    return null;
  }
})();

export { clipboard };
