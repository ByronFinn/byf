/**
 * MCP 配置页签(PRD-0036 / ADR-0039)。
 *
 * - 按 全局(`~/.byf/mcp.json`)/ 本地(`<工作区>/.byf/mcp.json`)两组列出
 *   server:name、transport 摘要、enabled 状态、实际文件路径(R-M1/R-N4)。
 * - 同名时全局条目带「被本地覆盖」标记,两份定义都保留(R-M4)。
 * - 写路径:表单增删改(name 创建后不可变,改名 = 删除 + 新建,R-M2)、
 *   enabled 开关即时落盘(R-M3)、字段级合并保留高级字段(R-M3a,服务端)。
 * - 掩码 round-trip(R-M2a/D2):env/headers 值以 `__MCP_MASKED_n__` 占位符
 *   回显;表单中不动 = 保留磁盘原值,输入新值 = 覆盖;占位符永不落盘。
 * - RAW 兜底(R-M5):损坏 scope 可一键进入 RAW 模式并显示磁盘原文(D3 例
 *   外);校验通过才保存(服务端 422 不落盘),修复后回到表单视图。
 * - 本地 scope 表单显示信任提示(R-M6);改动对新会话生效(R-N3)。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { mcpApi } from '#/api';
import {
  NoWorkspaceHint,
  WorkspaceScopeBar,
  type ScopeTabProps,
} from '#/components/settings/scope-workspace';
import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import { ConfirmDialog } from '#/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select';
import { errorMessage, toast } from '#/lib/toast';
import type { McpConfigScope, McpScopeState, McpServerConfig, McpServerEntry } from '#/types';

const INPUT_CLS =
  'w-full rounded-md border border-border-strong bg-input-fill px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60';

export function McpSettingsSection(props: ScopeTabProps): React.JSX.Element {
  const { scopeWorkDir } = props;
  const enabled = scopeWorkDir !== undefined;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['mcp-servers', scopeWorkDir],
    queryFn: () => mcpApi.listServers(scopeWorkDir!),
    enabled,
  });

  const [editing, setEditing] = useState<{
    readonly scope: McpConfigScope;
    readonly entry?: McpServerEntry;
  } | null>(null);
  const [deleting, setDeleting] = useState<{
    readonly scope: McpConfigScope;
    readonly name: string;
  } | null>(null);
  /** RAW 编辑模式的目标 scope(null = 表单视图)。 */
  const [rawScope, setRawScope] = useState<McpConfigScope | null>(null);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['mcp-servers', scopeWorkDir] });
  };

  const removeMutation = useMutation({
    mutationFn: (input: { scope: McpConfigScope; name: string }) =>
      mcpApi.removeServer(scopeWorkDir!, input.scope, input.name),
    onSuccess: () => {
      setDeleting(null);
      toast.success('已删除 MCP server(对新会话生效)');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(`删除失败:${errorMessage(error)}`);
    },
  });

  const toggleMutation = useMutation({
    /** 开关路径同样走 upsert:携带掩码 config + 翻转 enabled,占位符在服务端还原。 */
    mutationFn: (input: { scope: McpConfigScope; entry: McpServerEntry; next: boolean }) =>
      mcpApi.upsertServer(scopeWorkDir!, input.scope, {
        name: input.entry.name,
        config: { ...input.entry.config, enabled: input.next },
      }),
    onSuccess: () => {
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(`切换失败:${errorMessage(error)}`);
    },
  });

  const groupProps = (scope: McpConfigScope, state: McpScopeState) => ({
    scope,
    state,
    workDir: scopeWorkDir!,
    rawMode: rawScope === scope,
    onEnterRaw: () => {
      setRawScope(scope);
    },
    onExitRaw: () => {
      setRawScope(null);
    },
    onAdd: () => {
      setEditing({ scope });
    },
    onEdit: (entry: McpServerEntry) => {
      setEditing({ scope, entry });
    },
    onDelete: (name: string) => {
      setDeleting({ scope, name });
    },
    onToggleEnabled: (entry: McpServerEntry, next: boolean) => {
      toggleMutation.mutate({ scope, entry, next });
    },
    togglePending: toggleMutation.isPending,
    onInvalidate: invalidate,
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
              <ScopeGroup title="全局" hint="所有工作区共用。" {...groupProps('user', data.user)} />
              <div className="space-y-2">
                <WorkspaceScopeBar {...props} />
                <ScopeGroup
                  title="本地"
                  hint={`项目文件:${data.project.path}。项目 mcp.json 会在会话启动时执行其声明的命令,仅在你信任的工作区启用(R-M6)。`}
                  {...groupProps('project', data.project)}
                />
              </div>
            </>
          )}
        </>
      )}

      {editing !== null && (
        <McpServerFormDialog
          workDir={scopeWorkDir!}
          scope={editing.scope}
          entry={editing.entry}
          onCancel={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            invalidate();
          }}
        />
      )}

      {deleting !== null && (
        <ConfirmDialog
          title="删除 MCP server"
          message={`确定删除「${deleting.name}」?该操作立即写入 mcp.json,对新会话生效。`}
          confirmLabel="删除"
          busy={removeMutation.isPending}
          error={null}
          onCancel={() => {
            setDeleting(null);
          }}
          onConfirm={() => {
            removeMutation.mutate(deleting);
          }}
        />
      )}
    </section>
  );
}

interface ScopeGroupProps {
  readonly title: string;
  readonly hint: string;
  readonly scope: McpConfigScope;
  readonly state: McpScopeState;
  readonly workDir: string;
  readonly rawMode: boolean;
  readonly onEnterRaw: () => void;
  readonly onExitRaw: () => void;
  readonly onAdd: () => void;
  readonly onEdit: (entry: McpServerEntry) => void;
  readonly onDelete: (name: string) => void;
  readonly onToggleEnabled: (entry: McpServerEntry, next: boolean) => void;
  readonly togglePending: boolean;
  readonly onInvalidate: () => void;
}

function ScopeGroup(props: ScopeGroupProps): React.JSX.Element {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="shrink-0 text-xs font-medium text-fg-muted">{props.title}</h3>
        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">
          {props.state.path}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={props.rawMode ? props.onExitRaw : props.onEnterRaw}
        >
          {props.rawMode ? '返回表单' : 'RAW 编辑'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={props.state.invalid !== undefined}
          onClick={props.onAdd}
        >
          新增 server
        </Button>
      </div>
      {props.rawMode ? (
        <RawScopeEditor
          scope={props.scope}
          workDir={props.workDir}
          invalid={props.state.invalid !== undefined}
          onSaved={props.onInvalidate}
          onRepairSaved={props.onExitRaw}
        />
      ) : (
        <>
          <p className="text-[11px] text-fg-subtle">{props.hint}</p>
          {props.state.invalid !== undefined && (
            <div className="rounded-md border border-state-error bg-surface-2 p-3 text-xs">
              <p className="font-medium text-state-error">
                mcp.json 解析失败——该作用域配置暂不可用
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-fg-muted">
                {props.state.invalid.message}
              </p>
              <p className="mt-1 text-fg-muted">请切换到 RAW 编辑修复后再使用表单。</p>
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
                <ServerRow key={entry.name} entry={entry} {...props} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function ServerRow({
  entry,
  onEdit,
  onDelete,
  onToggleEnabled,
  togglePending,
}: {
  readonly entry: McpServerEntry;
} & ScopeGroupProps): React.JSX.Element {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2">
      <Checkbox
        checked={entry.config.enabled !== false}
        disabled={togglePending}
        onCheckedChange={(next) => {
          onToggleEnabled(entry, next === true);
        }}
        aria-label={`启用 ${entry.name}`}
      />
      <button
        type="button"
        className="flex min-w-0 flex-1 flex-col text-left"
        onClick={() => {
          onEdit(entry);
        }}
      >
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
      </button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px]"
        onClick={() => {
          onEdit(entry);
        }}
      >
        编辑
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-[11px] text-state-error"
        onClick={() => {
          onDelete(entry.name);
        }}
      >
        删除
      </Button>
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

/** RAW 兜底编辑器:损坏文件显示磁盘原文;保存校验失败 422 不落盘。 */
function RawScopeEditor(props: {
  readonly scope: McpConfigScope;
  readonly workDir: string;
  readonly invalid: boolean;
  readonly onSaved: () => void;
  readonly onRepairSaved: () => void;
}): React.JSX.Element {
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    mcpApi
      .readRaw(props.workDir, props.scope)
      .then((doc) => {
        if (!cancelled) {
          setText(doc.text);
          setLoaded(true);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          toast.error(`读取 RAW 失败:${errorMessage(error)}`);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [props.workDir, props.scope]);

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await mcpApi.writeRaw(props.workDir, props.scope, text);
      toast.success('已保存 mcp.json(对新会话生效)');
      props.onSaved();
      // 损坏修复流:保存成功回到表单视图(R-M5);主动 RAW 编辑则留在编辑器。
      if (props.invalid) props.onRepairSaved();
    } catch (error) {
      toast.error(`保存失败(未写入磁盘):${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-fg-subtle">
        整文件 JSON 编辑。合法文件的密钥值以占位符显示(保存原样占位符 = 保留磁盘 原值,输入新值 =
        覆盖);保存会规范化格式(2 空格缩进)。校验失败不会写入磁盘。
      </p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
        }}
        spellCheck={false}
        disabled={!loaded}
        rows={12}
        className="w-full resize-y rounded-md border border-border bg-surface-2 p-2 font-mono text-[12px] leading-5 text-fg-0 outline-none focus:border-brand"
        aria-label="mcp.json RAW 编辑器"
      />
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={saving || !loaded} onClick={() => void save()}>
          {saving ? '保存中…' : '校验并保存'}
        </Button>
      </div>
    </div>
  );
}

/** MCP 表单弹窗:覆盖常用字段(name / transport / stdio 或 http/sse 参数 / enabled)。 */
function McpServerFormDialog(props: {
  readonly workDir: string;
  readonly scope: McpConfigScope;
  readonly entry?: McpServerEntry;
  readonly onCancel: () => void;
  readonly onSaved: () => void;
}): React.JSX.Element {
  const { entry } = props;
  const existing = entry?.config;
  const [name, setName] = useState(entry?.name ?? '');
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>(
    existing?.transport ?? 'stdio',
  );
  const [command, setCommand] = useState(existing?.transport === 'stdio' ? existing.command : '');
  const [argsText, setArgsText] = useState(
    existing?.transport === 'stdio' ? (existing.args ?? []).join('\n') : '',
  );
  const [env, setEnv] = useState<KeyValueRow[]>(
    existing?.transport === 'stdio' ? toRows(existing.env) : [],
  );
  const [url, setUrl] = useState(
    existing !== undefined && existing.transport !== 'stdio' ? existing.url : '',
  );
  const [headers, setHeaders] = useState<KeyValueRow[]>(
    existing !== undefined && existing.transport !== 'stdio' ? toRows(existing.headers) : [],
  );
  const [serverEnabled, setServerEnabled] = useState(existing?.enabled !== false);
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0) {
      toast.error('server 名称不能为空');
      return;
    }
    const config: Record<string, unknown> = { transport, enabled: serverEnabled };
    if (transport === 'stdio') {
      if (command.trim().length === 0) {
        toast.error('stdio transport 需要 command');
        return;
      }
      config['command'] = command.trim();
      const args = argsText
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      if (args.length > 0) config['args'] = args;
      const envRecord = fromRows(env);
      if (envRecord !== undefined) config['env'] = envRecord;
    } else {
      if (url.trim().length === 0) {
        toast.error(`${transport} transport 需要 url`);
        return;
      }
      config['url'] = url.trim();
      const headerRecord = fromRows(headers);
      if (headerRecord !== undefined) config['headers'] = headerRecord;
    }
    setSaving(true);
    try {
      await mcpApi.upsertServer(props.workDir, props.scope, { name: name.trim(), config });
      toast.success('已保存(对新会话生效)');
      props.onSaved();
    } catch (error) {
      toast.error(`保存失败:${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={props.onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label={entry === undefined ? '新增 MCP server' : `编辑 ${entry.name}`}
        className="relative max-h-[80vh] w-[480px] overflow-y-auto rounded-xl border border-border bg-popover p-4 shadow-3"
      >
        <h2 className="text-sm font-semibold text-fg">
          {entry === undefined ? '新增 MCP server' : `编辑 ${entry.name}`}
        </h2>
        {props.scope === 'project' && (
          <p className="mt-1.5 rounded-md border border-state-warning bg-surface-2 p-2 text-[11px] text-fg-muted">
            信任提示:项目 mcp.json 会在会话启动时执行其声明的命令,仅在你信任的工作区启用。
          </p>
        )}
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-fg-muted">
              名称{entry !== undefined && '(创建后不可变,改名 = 删除 + 新建)'}
            </span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              disabled={entry !== undefined}
              className={`mt-1 ${INPUT_CLS}`}
              placeholder="例如 github"
            />
          </label>
          <label className="block">
            <span className="text-xs text-fg-muted">Transport</span>
            <Select
              value={transport}
              onValueChange={(next) => {
                setTransport(next as 'stdio' | 'http' | 'sse');
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stdio">stdio(本地命令)</SelectItem>
                <SelectItem value="http">http(流式 HTTP)</SelectItem>
                <SelectItem value="sse">sse(Server-Sent Events)</SelectItem>
              </SelectContent>
            </Select>
          </label>
          {transport === 'stdio' ? (
            <>
              <label className="block">
                <span className="text-xs text-fg-muted">命令(command)</span>
                <input
                  value={command}
                  onChange={(e) => {
                    setCommand(e.target.value);
                  }}
                  className={`mt-1 ${INPUT_CLS} font-mono`}
                  placeholder="例如 npx"
                />
              </label>
              <label className="block">
                <span className="text-xs text-fg-muted">参数(args,每行一个)</span>
                <textarea
                  value={argsText}
                  onChange={(e) => {
                    setArgsText(e.target.value);
                  }}
                  rows={3}
                  className={`mt-1 ${INPUT_CLS} font-mono`}
                  placeholder={'-y\n@modelcontextprotocol/server-github'}
                />
              </label>
              <KeyValueEditor
                label="环境变量(env)"
                hint="值以占位符回显——不动 = 保留原值,输入新值 = 覆盖"
                rows={env}
                onChange={setEnv}
              />
            </>
          ) : (
            <>
              <label className="block">
                <span className="text-xs text-fg-muted">URL</span>
                <input
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                  }}
                  className={`mt-1 ${INPUT_CLS} font-mono`}
                  placeholder="https://example.com/mcp"
                />
              </label>
              <KeyValueEditor
                label="请求头(headers)"
                hint="值以占位符回显——不动 = 保留原值,输入新值 = 覆盖"
                rows={headers}
                onChange={setHeaders}
              />
            </>
          )}
          <label className="flex items-center gap-2">
            <Checkbox
              checked={serverEnabled}
              onCheckedChange={(next) => {
                setServerEnabled(next === true);
              }}
            />
            <span className="text-xs text-fg-muted">启用(关闭后新会话不连接该 server)</span>
          </label>
          <p className="text-[11px] text-fg-subtle">
            高级字段(enabledTools / 超时等)请用列表页的「RAW 编辑」;保存时这些字段保留磁盘原值。
          </p>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={props.onCancel}
            disabled={saving}
          >
            取消
          </Button>
          <Button type="button" size="sm" onClick={() => void submit()} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface KeyValueRow {
  readonly key: string;
  readonly value: string;
}

function toRows(record: Record<string, string> | undefined): KeyValueRow[] {
  return Object.entries(record ?? {}).map(([key, value]) => ({ key, value }));
}

function fromRows(rows: readonly KeyValueRow[]): Record<string, string> | undefined {
  const entries = rows.filter((row) => row.key.trim().length > 0);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map((row) => [row.key.trim(), row.value]));
}

function KeyValueEditor(props: {
  readonly label: string;
  readonly hint: string;
  readonly rows: readonly KeyValueRow[];
  readonly onChange: (rows: KeyValueRow[]) => void;
}): React.JSX.Element {
  return (
    <div className="block">
      <span className="text-xs text-fg-muted">{props.label}</span>
      <p className="text-[11px] text-fg-subtle">{props.hint}</p>
      <div className="mt-1 space-y-1.5">
        {props.rows.map((row, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              value={row.key}
              onChange={(e) => {
                const next = [...props.rows];
                next[index] = { ...row, key: e.target.value };
                props.onChange(next);
              }}
              className={`${KV_FIELD_CLS} w-36 shrink-0 font-mono`}
              placeholder="KEY"
            />
            <input
              value={row.value}
              onChange={(e) => {
                const next = [...props.rows];
                next[index] = { ...row, value: e.target.value };
                props.onChange(next);
              }}
              className={`${KV_FIELD_CLS} min-w-0 flex-1 font-mono`}
              placeholder="值(占位符 = 保留原值)"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-state-error"
              onClick={() => {
                props.onChange(props.rows.filter((_, i) => i !== index));
              }}
              aria-label="删除该行"
            >
              ✕
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            props.onChange([...props.rows, { key: '', value: '' }]);
          }}
        >
          + 添加
        </Button>
      </div>
    </div>
  );
}

/**
 * KeyValueEditor 行的输入框基础类:与 INPUT_CLS 同源但**不含 `w-full`**——
 * 该行由 KEY 固定列宽 + value flex 分配,若带上 w-full 会覆盖 KEY 的
 * `w-36`(Tailwind width 类同层排序,w-full 后定义胜出),导致 KEY 撑满
 * 整行、value 被挤压成竖条。
 */
const KV_FIELD_CLS =
  'rounded-md border border-border-strong bg-input-fill px-2.5 py-1.5 text-sm outline-none focus:border-brand disabled:opacity-60';
