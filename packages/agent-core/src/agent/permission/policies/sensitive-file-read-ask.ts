/**
 * SensitiveFileReadAskPolicy — 敏感文件读 = 审批事件（PRD-0031 跟进 #298）。
 *
 * 背景：敏感文件（.env / SSH 私钥 / credentials）的**读**从工具层硬拒改为
 * 权限层强制 ask——用户批准即放行。写保持工具层硬拒（PATH_SENSITIVE，
 * 写配置/密钥文件是代码执行与外泄载体，业界共识分界线：读走审批、写硬拒）。
 *
 * 覆盖：
 *   - Read / ReadMediaFile：path 参数命中敏感模式 → ask
 *   - Bash / Shell / Background：命令解析出的 read 路径命中 → ask
 *     （search 对齐 Grep 工具豁免；write 由工具层硬拒；indirect 无路径不拦——
 *      与工具层一致的已知绕过面）
 *   - Grep / Glob：搜索工具豁免（现状不变）
 *
 * 模式语义：
 *   - manual / yolo：强制 ask（kimi-code 先例：yolo 不放行敏感读——yolo 用户
 *     可能未意识到在批准什么）
 *   - auto（AFK 信任模型）：不拦——headless 无法审批，goal 自主任务读取
 *     敏感文件是合理需求；用户选择 auto 即全权委托
 *
 * action 为 payload-scoped（含路径），actionToRulePattern 不为其生成宽泛规则
 * （批准一次只放行该路径，同路径会话内再次免问由 sessionApprovedActions 处理）。
 */

import type { ToolInputDisplay } from '../../../tools/display';
import {
  CONTENT_READING_SEARCH_VERBS,
  parseBashCommand,
} from '../../../tools/policies/bash-command';
import { resolvePathAccess } from '../../../tools/policies/path-access';
import { isSensitiveFile } from '../../../tools/policies/sensitive';
import type { PermissionPolicy } from '../policy';

/** 敏感读 action 前缀（payload-scoped：含路径，不生成宽泛 PermissionRule）。 */
export const SENSITIVE_READ_ACTION_PREFIX = 'read sensitive file: ';

const READ_TOOLS = new Set(['Read', 'ReadMediaFile']);
const COMMAND_TOOLS = new Set(['Bash', 'Shell', 'Background']);

/**
 * 从工具调用提取「会输出文件内容」的路径（敏感读检查的目标）：
 *   - Read / ReadMediaFile：path（read）
 *   - Bash/Shell/Background：
 *     - read 路径（cat/head/...）
 *     - **内容型 search** 路径（grep/rg/... 的文件操作数）——等价于读，
 *       会输出敏感内容（不同于 Grep 工具：Grep 工具豁免含结果过滤，
 *       Bash 的 grep 跑系统二进制无过滤，故必须纳入审批）。
 *       find/fd（只列名、不读内容）豁免。
 *
 * 注意：返回 (rawPath, subcommandVerb) 配对——verb 仅供本函数判定 search 类型，
 * 不影响调用方（调用方只消费 rawPath）。
 */
function readContentPathsOf(toolName: string, args: unknown): readonly string[] | undefined {
  if (args === null || typeof args !== 'object') return undefined;
  const rec = args as Record<string, unknown>;

  if (READ_TOOLS.has(toolName)) {
    return typeof rec['path'] === 'string' ? [rec['path']] : undefined;
  }
  if (COMMAND_TOOLS.has(toolName)) {
    if (typeof rec['command'] !== 'string') return undefined;
    const paths: string[] = [];
    for (const sub of parseBashCommand(rec['command']).subcommands) {
      for (const p of sub.paths) {
        if (p.operation === 'read') {
          paths.push(p.rawPath);
        } else if (p.operation === 'search' && CONTENT_READING_SEARCH_VERBS.has(sub.verb)) {
          paths.push(p.rawPath);
        }
      }
    }
    return paths.length > 0 ? paths : undefined;
  }
  return undefined;
}

export const SensitiveFileReadAskPolicy: PermissionPolicy = {
  name: 'sensitive-file-read-ask',
  evaluate({ agent, mode, toolCallContext }) {
    // AFK 信任模型：headless 无法审批（goal/cron 自主任务的合理读取不打断）
    if (mode === 'auto') return undefined;

    const rawPaths = readContentPathsOf(toolCallContext.toolCall.name, toolCallContext.args);
    if (rawPaths === undefined || rawPaths.length === 0) return undefined;

    const kaos = agent.runtime.kaos;
    const pathClass = kaos.pathClass();
    const cwd = agent.config.cwd;
    const sensitiveRaw: string[] = [];
    for (const raw of rawPaths) {
      let canonical: string;
      try {
        canonical = resolvePathAccess(
          raw,
          cwd,
          { workspaceDir: cwd, additionalDirs: [] },
          {
            operation: 'read',
            // 只做词法规范化（~ 展开 / .. 归并），敏感判定在此策略层进行
            policy: { guardMode: 'disabled', checkSensitive: false },
            pathClass,
            homeDir: kaos.gethome(),
          },
        ).path;
      } catch {
        continue; // 无法规范化的路径不误拦
      }
      if (isSensitiveFile(canonical, pathClass)) {
        sensitiveRaw.push(raw);
      }
    }
    if (sensitiveRaw.length === 0) return undefined;

    const display: ToolInputDisplay = {
      kind: 'generic',
      summary: `读取敏感文件：${sensitiveRaw.join(', ')}`,
      detail: {
        files: sensitiveRaw,
        note: 'Sensitive file (env / credential / SSH key). Approving grants reading this file only.',
      },
    };
    return {
      kind: 'ask',
      action: `${SENSITIVE_READ_ACTION_PREFIX}${sensitiveRaw.join(', ')}`,
      display,
    };
  },
};
