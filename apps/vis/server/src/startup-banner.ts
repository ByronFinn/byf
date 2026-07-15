export interface StartupBannerOptions {
  readonly authToken?: string;
  readonly host: string;
  readonly byfCodeHome: string;
  readonly port: number;
  /** Whether the SPA bundle is served. When false, the banner notes api-only. */
  readonly staticEnabled?: boolean;
}

export function formatStartupBanner(options: StartupBannerOptions): string {
  const authStatus = options.authToken === undefined ? 'auth=disabled' : 'auth=required';
  const spaStatus = options.staticEnabled === false ? ', api-only' : '';
  return (
    `[vis-server] listening on http://${hostForUrl(options.host)}:${String(options.port)} ` +
    `(${authStatus}${spaStatus}, BYF_HOME=${options.byfCodeHome})\n`
  );
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}
