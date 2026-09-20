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
  /**
   * 磁盘 `config.toml` 解析失败(PRD-0038 AC-1.7)。服务在这种状态下仍然启动
   * （否则"损坏后经 web 修复"这条旅程在启动层就断了),但必须把它说出来。
   */
  readonly configInvalid?: boolean;
}

/** 提取非回环 IPv4 地址(R-D1:banner 列出各 LAN IP 的完整访问 URL)。 */
export function collectLanIps(interfaces: readonly NetworkInterfaceInfo[]): string[];
export function collectLanIps(): string[];
export function collectLanIps(interfaces?: readonly NetworkInterfaceInfo[]): string[] {
  const list = interfaces ?? Object.values(networkInterfaces()).flatMap((entries) => entries ?? []);
  return list
    .filter((iface) => iface.family === 'IPv4' && !iface.internal)
    .map((iface) => iface.address);
}

export function formatWebStartupBanner(options: WebStartupBannerOptions): string {
  const authStatus = options.authToken === undefined ? 'auth=disabled' : 'auth=required';
  const spaStatus = options.staticEnabled === false ? ', api-only' : '';
  // PRD-0038 AC-1.2:回环自动 token 也必须出现在启动日志里——写操作一律要求 token,
  // 日志与 CLI 打开的 URL 是它的两个交付面(没有交付面 = 回环写不可用)。
  const tokenStatus = options.authToken === undefined ? '' : `, token=${options.authToken}`;
  let banner =
    `[web-server] listening on http://${hostForUrl(options.host)}:${String(options.port)} ` +
    `(${authStatus}${spaStatus}${tokenStatus}, BYF_HOME=${options.byfHome})\n`;
  // PRD-0038 AC-1.7：配置损坏时服务照样启动（修复路径要可达），但降级必须是明说的。
  if (options.configInvalid === true) {
    banner +=
      '[web-server] warning  config.toml is invalid (parse failed): running on built-in defaults. ' +
      'Fix it in the raw config editor before saving any settings.\n';
  }
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
