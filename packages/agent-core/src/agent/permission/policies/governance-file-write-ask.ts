/**
 * BYFGovernanceFileWriteAskPolicy — 写 BYF 自己的治理文件 = 审批事件（#345）。
 *
 * 这两个文件不是普通工程产物，它们是**授权来源**：
 *   - `<scope>/.byf/mcp.json` 的 `servers[].command` 是 MCP stdio 探针命令名单的
 *     唯一来源（`rpc/host-rpc.ts` 的 `assertProbeCommandAllowlisted` /
 *     `listedStdioCommands`，PRD-0038 AC-1.3），并且 project scope 的条目会在
 *     会话启动时被 `mcp/config-loader.ts` 拉起子进程；
 *   - `<scope>/.byf/config.toml` 携带 `default_permission_mode`
 *     （`rpc/core-impl.ts` 建会话时读它）与 provider 凭据。
 *
 * 而写它们原本不需要任何人点头：`default.git-cwd-write` policy 对**工作区内**
 * 任意非 `.git` 路径在 manual 模式下直接 `allow`，`<cwd>/.byf/mcp.json` 正好落在
 * 这个范围里；yolo 模式则整个跳过询问。于是"模型（哪怕只是被某段 hook 输出推动）
 * 改了自己的 spawn 名单"这件事在两个模式下都不会打断用户。
 *
 * 本 policy 把这条路径重新钉回用户裁决：manual 与 yolo 一律 ask（与
 * `YoloOutsideWorkspacePermissionPolicy` 同一立场——yolo 用户可能未意识到在批准
 * 什么）。与 `SensitiveFileReadAskPolicy` 一致的两点也照搬：
 *   - `auto`（AFK 信任模型）不拦：headless 无法审批，用户选 auto 即全权委托；
 *   - 不看 `matchedRule`：治理文件不因宽泛 allow 规则被静默放行。
 *
 * 诚实边界（ADR-0033：这是尽力而为的 UX 护栏，不是安全边界）：
 *   - 只约束 `Write` / `Edit` 与 `Bash` 命令解析出的 write 路径。`Bash` 的解析
 *     有已知绕过面（与 `SensitiveFileReadAskPolicy` 同一已知面），符号链接指向
 *     也不在本检查范围内（词法规范化，见 `tools/policies/path-access.ts`）。
 *   - 判定的是"目标路径是不是 BYF 治理文件"，不是"这段文字像不像注入"。后者做不
 *     可靠，且会把 best-effort 伪装成保证。
 */

import * as posixPath from 'node:path/posix';
import * as win32Path from 'node:path/win32';

import type { ToolInputDisplay } from '../../../tools/display';
import { parseBashCommand } from '../../../tools/policies/bash-command';
import { resolvePathAccess, type PathClass } from '../../../tools/policies/path-access';
import type { PermissionPolicy } from '../policy';

/**
 * 治理文件写 action 前缀（payload-scoped：含路径，不生成宽泛 PermissionRule）。
 * 注册进 `actionToRulePattern` 的 payload-scoped 分支，否则
 * `approve_for_session` 会退化成 `fallbackToolName` —— 一次批准变成整个 `Write`
 * 工具免问。
 */
export const GOVERNANCE_WRITE_ACTION_PREFIX = 'write BYF governance file: ';

/** 受保护的文件名：授权来源只有这两个。 */
const GOVERNANCE_BASENAMES = new Set<string>(['mcp.json', 'config.toml']);
/** 它们的直接父目录名（user 与 project 两个 scope 同形）。 */
const BYF_CONFIG_DIRNAME = '.byf';

const WRITE_TOOLS = new Set(['Write', 'Edit']);
const COMMAND_TOOLS = new Set(['Bash', 'Shell', 'Background']);

function pathMod(pathClass: PathClass): typeof posixPath {
  return pathClass === 'win32' ? win32Path : posixPath;
}

/**
 * 规范路径是否 BYF 治理文件：`<...>/.byf/{mcp.json,config.toml}`。
 *
 * 直接父目录必须是 `.byf`，所以 `<repo>/notes/mcp.json` 这类工程内同名文件不会被
 * 误伤；`~/.byf/mcp.json` 与 `<cwd>/.byf/mcp.json` 都命中（project scope 才是
 * 本 policy 的主要目标，user scope 已在 yolo 下被 workspace 检查拦过一次）。
 */
export function isByfGovernanceFile(canonicalPath: string, pathClass: PathClass): boolean {
  const mod = pathMod(pathClass);
  const name = mod.basename(canonicalPath);
  if (!GOVERNANCE_BASENAMES.has(name.toLowerCase())) return false;
  return mod.basename(mod.dirname(canonicalPath)) === BYF_CONFIG_DIRNAME;
}

/** 从工具调用提取「可能写到磁盘」的路径（与敏感读 policy 同一提取形状）。 */
function writePathsOf(toolName: string, args: unknown): readonly string[] | undefined {
  if (args === null || typeof args !== 'object') return undefined;
  const rec = args as Record<string, unknown>;

  if (WRITE_TOOLS.has(toolName)) {
    return typeof rec['path'] === 'string' ? [rec['path']] : undefined;
  }
  if (COMMAND_TOOLS.has(toolName)) {
    if (typeof rec['command'] !== 'string') return undefined;
    const paths: string[] = [];
    for (const sub of parseBashCommand(rec['command']).subcommands) {
      for (const p of sub.paths) {
        if (p.operation === 'write') paths.push(p.rawPath);
      }
    }
    return paths.length > 0 ? paths : undefined;
  }
  return undefined;
}

export const BYFGovernanceFileWriteAskPolicy: PermissionPolicy = {
  name: 'governance-file-write-ask',
  evaluate({ agent, mode, toolCallContext }) {
    // 与 SensitiveFileReadAskPolicy 一致：AFK 信任模型下无人可问。
    if (mode !== 'manual' && mode !== 'yolo') return undefined;

    const rawPaths = writePathsOf(toolCallContext.toolCall.name, toolCallContext.args);
    if (rawPaths === undefined || rawPaths.length === 0) return undefined;

    const kaos = agent.runtime.kaos;
    const pathClass = kaos.pathClass();
    const cwd = agent.config.cwd;
    const hits: string[] = [];
    for (const raw of rawPaths) {
      let canonical: string;
      try {
        canonical = resolvePathAccess(
          raw,
          cwd,
          { workspaceDir: cwd, additionalDirs: [] },
          {
            operation: 'write',
            // 只做词法规范化（~ 展开 / .. 归并），越界与敏感与否不由本 policy 裁决
            policy: { guardMode: 'disabled', checkSensitive: false },
            pathClass,
            homeDir: kaos.gethome(),
          },
        ).path;
      } catch {
        continue; // 无法规范化的路径不误拦
      }
      if (isByfGovernanceFile(canonical, pathClass)) hits.push(raw);
    }
    if (hits.length === 0) return undefined;

    const display: ToolInputDisplay = {
      kind: 'generic',
      summary: `写入 BYF 治理文件：${hits.join(', ')}`,
      detail: {
        files: hits,
        note:
          'BYF governance file (MCP spawn allowlist / config incl. default permission mode). ' +
          'Approving lets this write only; agent-authored edits to these files are never an ' +
          'authorization for spawning or for a permission-mode change.',
      },
    };
    return {
      kind: 'ask',
      action: `${GOVERNANCE_WRITE_ACTION_PREFIX}${hits.join(', ')}`,
      display,
    };
  },
};
