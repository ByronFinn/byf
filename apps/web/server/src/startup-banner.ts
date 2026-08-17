import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export interface WebStartupBannerOptions {
  readonly authToken?: string;
  readonly host: string;
  readonly byfHome: string;
  readonly port: number;
  /** 是否正在提供 SPA bundle。false 表示仅 API。 */
  readonly staticEnabled?: boolean;
  /** 非回环网卡 IPv4(PRD-0034 R-D1);由调用方经 os.networkInterfaces 收集。 */
  readonly lanIps?: readonly string[];
}

/** 提取非回环 IPv4 地址(R-D1:banner 列出各 LAN IP 的完整访问 URL)。 */
export function collectLanIps(interfaces: readonly NetworkInterfaceInfo[]): string[];
export function collectLanIps(): string[];
export function collectLanIps(interfaces?: readonly NetworkInterfaceInfo[]): string[] {
  const list = interfaces ?? Object.values(networkInterfaces()).flatMap((entries) => entries ?? []);
  return list
    .filter((iface) => iface.family === 'IPv4' && iface.internal !== true)
    .map((iface) => iface.address);
}

export function formatWebStartupBanner(options: WebStartupBannerOptions): string {
  const authStatus = options.authToken === undefined ? 'auth=disabled' : 'auth=required';
  const spaStatus = options.staticEnabled === false ? ', api-only' : '';
  let banner =
    `[web-server] listening on http://${hostForUrl(options.host)}:${String(options.port)} ` +
    `(${authStatus}${spaStatus}, BYF_HOME=${options.byfHome})\n`;
  // R-D1:非回环绑定时,每个 LAN IP 一行完整 URL(含 ?token=)+ 轮换提示
  // (token 会进浏览器历史,ADR-0036 D1 已知代价)。
  if (options.lanIps !== undefined && options.lanIps.length > 0) {
    const token = options.authToken !== undefined ? `/?token=${options.authToken}` : '';
    for (const ip of options.lanIps) {
      banner += `[web-server] lan      http://${ip}:${String(options.port)}${token}\n`;
    }
    if (options.authToken !== undefined) {
      banner += '[web-server] note     token 会进入浏览器历史记录,建议用后轮换 WEB_AUTH_TOKEN\n';
    }
  }
  return banner;
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}
