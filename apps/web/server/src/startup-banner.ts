export interface WebStartupBannerOptions {
  readonly authToken?: string;
  readonly host: string;
  readonly byfHome: string;
  readonly port: number;
  /** 是否正在提供 SPA bundle。false 表示仅 API。 */
  readonly staticEnabled?: boolean;
}

export function formatWebStartupBanner(options: WebStartupBannerOptions): string {
  const authStatus = options.authToken === undefined ? 'auth=disabled' : 'auth=required';
  const spaStatus = options.staticEnabled === false ? ', api-only' : '';
  return (
    `[web-server] listening on http://${hostForUrl(options.host)}:${String(options.port)} ` +
    `(${authStatus}${spaStatus}, BYF_HOME=${options.byfHome})\n`
  );
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}
