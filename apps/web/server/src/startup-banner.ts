import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

export interface WebStartupBannerOptions {
  /**
   * 本次启动**生效**的 token。必填:`resolveAuthToken`(app.ts)保证任何一次启动都
   * 有值(显式配置值,或回环下本次生成的自动 token),所以"没有 token 可报"这个状态
   * 在运行时不可达——留着它只会让横幅在同一行里说出 `auth=disabled` 这句假话,而
   * 横幅正是 AC-1.2 要求的凭证交付面。
   */
  readonly authToken: string;
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
  // 鉴权永远是 required：token 必然存在（见 WebStartupBannerOptions.authToken），
  // 横幅里不再留一个只会说假话的 "disabled" 分支。
  const authStatus = 'auth=required';
  const spaStatus = options.staticEnabled === false ? ', api-only' : '';
  // PRD-0038 AC-1.2:回环自动 token 也必须出现在启动日志里——写操作一律要求 token,
  // 日志与 CLI 打开的 URL 是它的两个交付面(没有交付面 = 回环写不可用)。
  const tokenStatus = `, token=${options.authToken}`;
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
    const token = `/?token=${options.authToken}`;
    for (const ip of options.lanIps) {
      banner += `[web-server] lan      http://${ip}:${String(options.port)}${token}\n`;
    }
    banner += '[web-server] note     token 会进入浏览器历史记录,建议用后轮换 WEB_AUTH_TOKEN\n';
  }
  return banner;
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}
