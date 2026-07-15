#!/usr/bin/env bun
/**
 * Write public declaration files for @byfriends/vis-server.
 *
 * Full `tsc --emitDeclarationOnly` over the server sources is not viable today:
 * the package pulls in shared types outside `src/` and previously relied on
 * tsdown's lenient dts bundler. The published export surface is intentionally
 * tiny (`startVisServer` + a handful of helpers) and is mirrored here so
 * publint/attw keep working after the bun-build migration (PRD-0020 / #214).
 *
 * Keep in sync with the exported names/types in `src/server.ts`.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(packageRoot, 'dist');

const serverDts = `/** Options for starting a vis HTTP server programmatically. */
export interface StartVisServerOptions {
  /** Bind host. Defaults to \`resolveHost()\` (loopback). */
  readonly host?: string;
  /** Bind port. Defaults to \`resolvePort()\` (3001). */
  readonly port?: number;
  /** Auth token. Defaults to \`resolveVisAuthToken(host)\` (required outside loopback). */
  readonly authToken?: string;
  /**
   * Directory holding the built SPA assets to serve. When omitted, the
   * \`public/\` directory next to the compiled server bundle is used (if any);
   * in dev mode this resolves to \`null\` and only the API is served.
   */
  readonly publicDir?: string;
}
/** A handle to a running vis server. */
export interface VisServerHandle {
  /** The host the server is bound to. */
  readonly host: string;
  /** The port the server is bound to. */
  readonly port: number;
  /** Whether the SPA bundle is being served. False means API-only. */
  readonly staticEnabled: boolean;
  /** Base URL (\`http://<host>:<port>\`), with IPv6 hosts bracketed. */
  readonly url: string;
  /** Stop the server. Subsequent connections are refused. */
  close(): void;
}
/**
 * Start the vis HTTP server programmatically. Resolves once the server is
 * listening. Used by the CLI \`byf vis\` subcommand (in-process) and by the
 * standalone \`index.ts\` entry.
 */
export declare function startVisServer(options?: StartVisServerOptions): Promise<VisServerHandle>;
/**
 * Resolve the BYF_HOME the server reads session records from. Exposed for the
 * standalone entry's startup banner. CLI consumers rely on the same env var.
 */
export declare function resolveVisByfHome(): string;
/**
 * Format the startup banner text. Exposed so the CLI can reuse the exact same
 * wording without depending on startup-banner internals.
 */
export declare function formatVisStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
  readonly staticEnabled?: boolean;
}): string;
`;

await mkdir(distDir, { recursive: true });
await Bun.write(path.join(distDir, 'server.d.mts'), serverDts);
await Bun.write(path.join(distDir, 'index.d.mts'), 'export {};\n');
console.log('vis-server build-dts: wrote dist/server.d.mts (+ index.d.mts)');
