#!/usr/bin/env bun
/**
 * 为 @byfriends/web-server 写公共声明文件。
 *
 * 完整 `tsc --emitDeclarationOnly` 不可行(包引入 src 外共享类型)。发布面很小
 * (`startWebServer` + 句柄 + 横幅),此处手写镜像,使 publint/attw 在 bun-build
 * 迁移后保持可用。与 `src/server.ts` 的导出名保持同步。
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const distDir = path.join(packageRoot, 'dist');

const serverDts = `/** Options for starting the web HTTP server programmatically. */
export interface StartWebServerOptions {
  /** Bind host. Defaults to resolveHost() (loopback). */
  readonly host?: string;
  /** Bind port. Defaults to resolvePort() (4100). */
  readonly port?: number;
  /** Auth token. Defaults to resolveWebAuthToken(host) (required outside loopback). */
  readonly authToken?: string;
  /** Directory holding the built SPA assets to serve. When omitted, auto-detected. */
  readonly publicDir?: string;
}
/** A handle to a running web server. */
export interface WebServerHandle {
  readonly host: string;
  readonly port: number;
  readonly staticEnabled: boolean;
  readonly url: string;
  close(): void;
}
/**
 * Start the web HTTP server programmatically. Resolves once listening. Used by the
 * CLI \`byf web\` subcommand (in-process) and the standalone \`index.ts\` entry.
 */
export declare function startWebServer(options?: StartWebServerOptions): Promise<WebServerHandle>;
/** Format the startup banner text (reused by the CLI). */
export declare function formatWebServerStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
  readonly staticEnabled?: boolean;
}): string;
`;

await mkdir(distDir, { recursive: true });
await Bun.write(path.join(distDir, 'server.d.mts'), serverDts);
await Bun.write(path.join(distDir, 'index.d.mts'), 'export {};\n');
console.log('web-server build-dts: wrote dist/server.d.mts (+ index.d.mts)');
