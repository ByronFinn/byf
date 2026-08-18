/**
 * MCP 配置页签(PRD-0036 / ADR-0039)。
 *
 * - 按 全局(`~/.byf/mcp.json`)/ 本地(`<工作区>/.byf/mcp.json`)两组列出
 *   server:name、transport 摘要、enabled 状态、实际文件路径(R-M1/R-N4)。
 * - 同名时全局条目带「被本地覆盖」标记,两份定义都保留(R-M4)。
 * - env/headers 值服务端已掩码(`__MCP_MASKED_n__`),明文永不跨线(D1)。
 * - 某 scope 的 mcp.json 损坏时该组显示错误态(R-M5),RAW 兜底编辑在
 *   写路径切片(#313)接入。
 * - 改动对新会话生效(R-N3):运行中的会话不会热重载 mcp.json。
 */
import { useQuery } from '@tanstack/react-query';

import { mcpApi } from '#/api';
import {
  NoWorkspaceHint,
  WorkspaceScopeBar,
  type ScopeTabProps,
} from '#/components/settings/scope-workspace';
import type { McpScopeState, McpServerConfig, McpServerEntry } from '#/types';

export function McpSettingsSection(props: ScopeTabProps): React.JSX.Element {
  const { scopeWorkDir } = props;
  const enabled = scopeWorkDir !== undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-servers', scopeWorkDir],
    queryFn: () => mcpApi.listServers(scopeWorkDir!),
    enabled,
  });

  return (
    <section aria-label="MCP 配置" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">MCP 配置</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          按全局 / 本地两个作用域管理 MCP server;本地同名条目覆盖全局。改动对
          <b className="text-fg-1">新会话</b>生效,运行中的会话不会热重载。env / headers
          值以占位符回显,保存时不动 = 保留原值。
        </p>
      </div>

      {props.workspaces.length === 0 && <NoWorkspaceHint />}

      {enabled && (
        <>
          {isLoading && <p className="text-xs text-fg-subtle">加载中…</p>}
          {data !== undefined && (
            <>
              <ScopeGroup
                title="全局"
                state={data.user}
                hint="所有工作区共用(`~/.byf/mcp.json`)。"
              />
              <div className="space-y-2">
                <WorkspaceScopeBar {...props} />
                <ScopeGroup
                  title="本地"
                  state={data.project}
                  hint="项目 mcp.json 会在会话启动时执行其声明的命令,仅在你信任的工作区启用。"
                />
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ScopeGroup(props: {
  readonly title: string;
  readonly state: McpScopeState;
  readonly hint: string;
}): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-medium text-fg-muted">{props.title}</h3>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">
          {props.state.path}
        </code>
      </div>
      <p className="text-[11px] text-fg-subtle">{props.hint}</p>
      {props.state.invalid !== undefined && (
        <div className="rounded-md border border-state-error bg-surface-2 p-3 text-xs">
          <p className="font-medium text-state-error">mcp.json 解析失败——该作用域配置暂不可用</p>
          <p className="mt-1 break-all font-mono text-[11px] text-fg-muted">
            {props.state.invalid.message}
          </p>
          <p className="mt-1 text-fg-muted">请通过下方 RAW 编辑修复后再使用表单。</p>
        </div>
      )}
      {props.state.invalid === undefined && props.state.servers.length === 0 && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
          暂无 server。
        </p>
      )}
      {props.state.servers.length > 0 && (
        <ul className="space-y-1">
          {props.state.servers.map((entry) => (
            <ServerRow key={entry.name} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ServerRow({ entry }: { readonly entry: McpServerEntry }): React.JSX.Element {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm text-fg">{entry.name}</span>
          {entry.overridden === true && (
            <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
              被本地覆盖
            </span>
          )}
        </span>
        <span className="truncate font-mono text-[11px] text-fg-subtle">
          {transportSummary(entry.config)}
        </span>
      </span>
      <span
        className={
          entry.config.enabled === false
            ? 'shrink-0 text-xs text-fg-subtle'
            : 'shrink-0 text-xs text-state-success'
        }
      >
        {entry.config.enabled === false ? '已停用' : '已启用'}
      </span>
    </li>
  );
}

function transportSummary(config: McpServerConfig): string {
  if (config.transport === 'stdio') {
    const args = (config.args ?? []).join(' ');
    return `stdio · ${config.command}${args.length > 0 ? ` ${args}` : ''}`;
  }
  return `${config.transport} · ${config.url}`;
}
