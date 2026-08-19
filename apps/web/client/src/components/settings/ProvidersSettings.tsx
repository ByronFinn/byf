import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, KeyRound, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { api } from '#/api';
import { Button } from '#/components/ui/button';
import { Checkbox } from '#/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { errorMessage, toast } from '#/lib/toast';
import { cn } from '#/lib/utils';
import type { ConfigModelView, ConfigResponse, ProviderCreateBody } from '#/types';

const CONFIG_KEY = ['config'] as const;

const PROVIDER_TYPES = [
  'anthropic',
  'openai-completions',
  'google-genai',
  'openai_responses',
  'vertexai',
] as const;

/** 工具 / 媒体能力标签(与 config/schema.ts 的 capabilities 字段一致)。 */
const MEDIA_CAPABILITIES: readonly { tag: string; label: string }[] = [
  { tag: 'tool_use', label: '工具调用' },
  { tag: 'image_in', label: '图片' },
  { tag: 'video_in', label: '视频' },
  { tag: 'audio_in', label: '音频' },
];

/**
 * 推理能力:与 CLI model-selector 的 thinkingAvailability 语义对齐
 * (always_thinking > thinking_effort > thinking > 不支持)。
 */
type ThinkingKind = 'unsupported' | 'toggle' | 'effort' | 'always-on';

const THINKING_KINDS: readonly {
  kind: ThinkingKind;
  label: string;
  tags: readonly string[];
}[] = [
  { kind: 'unsupported', label: '不支持', tags: [] },
  { kind: 'toggle', label: '支持开关', tags: ['thinking'] },
  { kind: 'effort', label: '支持强度调节', tags: ['thinking_effort'] },
  { kind: 'always-on', label: '总是思考', tags: ['always_thinking'] },
];

const THINKING_TAGS = ['thinking', 'thinking_effort', 'always_thinking'] as const;

function thinkingKindOf(capabilities: ReadonlySet<string>): ThinkingKind {
  if (capabilities.has('always_thinking')) return 'always-on';
  if (capabilities.has('thinking_effort')) return 'effort';
  if (capabilities.has('thinking')) return 'toggle';
  return 'unsupported';
}

/**
 * 用合并能力(注册表 ∪ 别名标签)初始化编辑器勾选。注册表未覆盖(或别名无法
 * 解析,resolvedCapabilities 为 undefined)时退回裸标签。总是思考只能由显式
 * 标签表达(合并面不携带该区分);thinking_xhigh / thinking_max 是高档位勾选。
 */
function seedModelCapabilities(model: ConfigModelView): Set<string> {
  const raw = model.capabilities ?? [];
  const resolved = model.resolvedCapabilities;
  if (resolved === undefined) {
    return new Set(raw.length > 0 ? raw : ['tool_use']);
  }
  const seed = new Set<string>();
  if (resolved.tool_use) seed.add('tool_use');
  if (resolved.image_in) seed.add('image_in');
  if (resolved.video_in) seed.add('video_in');
  if (resolved.audio_in) seed.add('audio_in');
  if (raw.includes('always_thinking')) {
    seed.add('always_thinking');
  } else if (resolved.thinking_effort) {
    seed.add('thinking_effort');
  } else if (resolved.thinking) {
    seed.add('thinking');
  }
  if (resolved.thinking_xhigh) seed.add('thinking_xhigh');
  if (resolved.thinking_max) seed.add('thinking_max');
  return seed;
}

/**
 * 容量输入:支持 256K / 1M 后缀(R-D3)。K/M 为十进制(128K = 128000),与
 * token 惯例及代码默认 128_000 一致;TUI 侧同字段为纯数字 token 数。
 */
export function parseContextSize(raw: string): number | null {
  const trimmed = raw.trim().toUpperCase();
  const match = /^(\d+(?:\.\d+)?)([KM]?)$/.exec(trimmed);
  if (match === null) return null;
  const value = Number.parseFloat(match[1]!);
  const unit = match[2];
  const scaled = unit === 'M' ? value * 1_000_000 : unit === 'K' ? value * 1_000 : value;
  const rounded = Math.round(scaled);
  return Number.isSafeInteger(rounded) && rounded > 0 ? rounded : null;
}

/**
 * 模型与 Provider 管理(PRD-0034 R-D3,交互蓝本 = deepseek-harness settings):
 * Provider 为父、模型别名嵌套其下(展开即见所属模型,可就地增删改);
 * 行卡 + 展开行内编辑(单卡互斥)、apiKey 只写不读(placeholder 表状态,env/oauth
 * 输入禁用)、折叠高级区、fetch available models(草稿探测 + 勾选采纳)、删除
 * 二次确认(区分连带删 key)。不抄清单:revision 乐观锁/热重载/onboarding/开关/
 * 排序/设置文档按钮。
 */
export function ProvidersSection(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: CONFIG_KEY });
  };

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [addingProvider, setAddingProvider] = useState(false);
  const [editingUnlinked, setEditingUnlinked] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    hasApiKey: boolean;
  } | null>(null);

  const removeMutation = useMutation({
    mutationFn: (id: string) => api.removeProvider(id),
    onSuccess: () => {
      invalidate();
      toast.success('Provider 已删除');
      setConfirmDelete(null);
      setExpandedProvider(null);
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
  });

  const models = config?.models ?? [];
  const providerIds = new Set(config?.providers.map((provider) => provider.id) ?? []);
  const unlinkedModels = models.filter((model) => !providerIds.has(model.provider));

  return (
    <section aria-label="模型与 Provider" className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">Provider</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAddingProvider((v) => !v);
              setExpandedProvider(null);
            }}
          >
            <Plus className="size-3.5" aria-hidden />
            新增 Provider
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {config?.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              models={models.filter((model) => model.provider === provider.id)}
              expanded={expandedProvider === provider.id}
              onToggle={() => {
                setExpandedProvider(expandedProvider === provider.id ? null : provider.id);
                setAddingProvider(false);
              }}
              onChanged={invalidate}
              onDelete={() => {
                setConfirmDelete({
                  id: provider.id,
                  hasApiKey: provider.hasApiKey,
                });
              }}
            />
          ))}
          {addingProvider && (
            <AddProviderCard
              onCancel={() => {
                setAddingProvider(false);
              }}
              onCreated={() => {
                setAddingProvider(false);
                invalidate();
              }}
            />
          )}
        </div>
      </div>

      {config !== undefined && unlinkedModels.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-fg">未挂靠 Provider 的模型</h2>
          <p className="mt-0.5 text-xs text-fg-subtle">
            这些别名引用的 Provider 不存在(多为手改 config.toml 所致),可删除或修正。
          </p>
          <div className="mt-2 space-y-1.5">
            {unlinkedModels.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                showProvider
                expanded={editingUnlinked === model.id}
                onToggle={() => {
                  setEditingUnlinked(editingUnlinked === model.id ? null : model.id);
                }}
                onChanged={invalidate}
              />
            ))}
          </div>
        </div>
      )}

      {confirmDelete !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-scrim"
            onClick={() => {
              setConfirmDelete(null);
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="删除 Provider"
            className="relative w-96 rounded-lg border border-border bg-popover p-4 shadow-3"
          >
            <h3 className="text-sm font-semibold text-fg">删除 Provider「{confirmDelete.id}」?</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
              {confirmDelete.hasApiKey
                ? '将同时删除已保存的 API key,及其全部模型别名。此操作不可撤销。'
                : '将删除该 Provider 及其全部模型别名(未保存 API key)。此操作不可撤销。'}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmDelete(null);
                }}
                disabled={removeMutation.isPending}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removeMutation.isPending}
                onClick={() => {
                  removeMutation.mutate(confirmDelete.id);
                }}
              >
                {removeMutation.isPending ? '删除中…' : '删除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ---- Provider 行卡 + 展开编辑 ---------------------------------------------------

function ProviderCard(props: {
  provider: ConfigResponse['providers'][number];
  models: readonly ConfigModelView[];
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
  onDelete: () => void;
}): React.JSX.Element {
  const { provider, models, expanded, onToggle, onChanged, onDelete } = props;
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl ?? '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [type, setType] = useState(provider.type);
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [addingModel, setAddingModel] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateProvider(provider.id, {
        apiKey: apiKey.length > 0 ? apiKey : undefined,
        baseUrl: baseUrl.trim().length > 0 ? baseUrl.trim() : undefined,
        type: type as ProviderCreateBody['type'],
      }),
    onSuccess: () => {
      onChanged();
      setApiKey('');
      toast.success('Provider 已保存');
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
  });

  const inputDisabled = provider.oauth === true;
  const placeholder = provider.oauth
    ? 'OAuth Provider——请在 CLI 中运行 /login'
    : provider.keyFromEnv
      ? '由环境变量提供'
      : provider.hasApiKey
        ? '已配置——输入新值可替换'
        : '未配置';

  return (
    <div className="rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-hover"
      >
        <KeyRound
          className={cn(
            'size-3.5 shrink-0',
            provider.hasApiKey ? 'text-state-success' : 'text-fg-subtle',
          )}
          aria-hidden
        />
        <span className="shrink-0 font-mono text-sm text-fg">{provider.id}</span>
        <span className="shrink-0 text-xs text-fg-subtle">{provider.type}</span>
        <span className="shrink-0 text-xs text-fg-subtle">· {models.length} 模型</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
          {provider.baseUrl ?? ''}
        </span>
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-fg-subtle transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-fg-muted">模型别名({models.length})</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAddingModel((v) => !v);
                  setEditingModel(null);
                }}
              >
                <Plus className="size-3.5" aria-hidden />
                新增模型
              </Button>
            </div>
            {models.length === 0 && !addingModel && (
              <p className="text-xs text-fg-subtle">暂无模型别名。</p>
            )}
            {models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                nested
                expanded={editingModel === model.id}
                onToggle={() => {
                  setEditingModel(editingModel === model.id ? null : model.id);
                  setAddingModel(false);
                }}
                onChanged={onChanged}
              />
            ))}
            {addingModel && (
              <AddModelRow
                providerId={provider.id}
                onCancel={() => {
                  setAddingModel(false);
                }}
                onCreated={() => {
                  setAddingModel(false);
                  onChanged();
                }}
              />
            )}
          </div>

          <div className="border-t border-border pt-3">
            <label className="block">
              <span className="text-xs text-fg-muted">API Key(留空 = 不变)</span>
              <input
                type="password"
                value={apiKey}
                disabled={inputDisabled}
                placeholder={placeholder}
                onChange={(e) => {
                  setApiKey(e.target.value);
                }}
                className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 font-mono text-sm outline-none focus:border-brand disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setAdvancedOpen((v) => !v);
              }}
              className="text-xs text-fg-muted transition-colors hover:text-fg"
            >
              {advancedOpen ? '收起' : '展开'}高级设置
            </button>
            {advancedOpen && (
              <div className="space-y-2 rounded-md border border-border bg-surface-2 p-2.5">
                <label className="block">
                  <span className="text-xs text-fg-muted">Base URL</span>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => {
                      setBaseUrl(e.target.value);
                    }}
                    placeholder="https://api.example.com/v1"
                    className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 font-mono text-xs outline-none focus:border-brand"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-fg-muted">类型</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 text-left text-xs text-fg"
                      >
                        {type}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {PROVIDER_TYPES.map((t) => (
                        <DropdownMenuItem
                          key={t}
                          onSelect={() => {
                            setType(t);
                          }}
                        >
                          {t}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </label>
                <p className="text-xs text-fg-subtle">
                  customHeaders / extraBody 等高级字段请直接编辑 config.toml(路径见通用设置)。
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDelete}
                className="text-state-error hover:bg-state-error/10"
              >
                <Trash2 className="size-3.5" aria-hidden />
                删除
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveMutation.isPending}
                onClick={() => {
                  saveMutation.mutate();
                }}
              >
                {saveMutation.isPending ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- 新增 Provider(一次提交建全:id + type + baseUrl + key + ≥1 模型) -------

interface DraftModelRow {
  alias: string;
  modelId: string;
  context: string;
}

function AddProviderCard(props: {
  onCancel: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const { onCancel, onCreated } = props;
  const [id, setId] = useState('');
  const [type, setType] = useState('openai-completions');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [models, setModels] = useState([{ alias: '', modelId: '', context: '128000' }]);
  const [discovering, setDiscovering] = useState(false);
  const [discovered, setDiscovered] = useState<{ id: string; checked: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchRow = (index: number, patch: Partial<DraftModelRow>): void => {
    setModels((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const createMutation = useMutation({
    mutationFn: () => {
      const body: ProviderCreateBody = {
        id: id.trim(),
        type: type as ProviderCreateBody['type'],
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.length > 0 ? apiKey : undefined,
        models: models
          .filter((row) => row.alias.trim().length > 0 && row.modelId.trim().length > 0)
          .map((row) => {
            const size = parseContextSize(row.context);
            return {
              id: row.alias.trim(),
              provider: id.trim(),
              model: row.modelId.trim(),
              maxContextSize: size ?? 128_000,
            };
          }),
      };
      return api.createProvider(body);
    },
    onSuccess: () => {
      toast.success('Provider 已创建');
      onCreated();
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  const discover = async (): Promise<void> => {
    setDiscovering(true);
    setError(null);
    try {
      const { models: found } = await api.discoverModels({
        type: type as ProviderCreateBody['type'],
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.length > 0 ? apiKey : undefined,
      });
      setDiscovered(found.map((m) => ({ id: m.id, checked: false })));
    } catch (error) {
      setError(errorMessage(error as Error));
    } finally {
      setDiscovering(false);
    }
  };

  const adoptDiscovered = (): void => {
    const existing = new Set(models.map((row) => row.modelId.trim()).filter((m) => m.length > 0));
    const next = models.filter((row) => row.alias.trim().length > 0);
    for (const candidate of discovered ?? []) {
      if (!candidate.checked || existing.has(candidate.id)) continue;
      next.push({
        alias: candidate.id.split('/').pop() ?? candidate.id,
        modelId: candidate.id,
        context: '128000',
      });
    }
    if (next.length > 0) setModels(next);
    setDiscovered(null);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border-strong bg-surface-1 p-3">
      <h3 className="text-sm font-semibold text-fg">新增 Provider</h3>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs text-fg-muted">Provider ID(小写 slug)</span>
          <input
            type="text"
            value={id}
            placeholder="my-provider"
            onChange={(e) => {
              setId(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
          />
        </label>
        <label className="block">
          <span className="text-xs text-fg-muted">类型</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 text-left text-sm text-fg"
              >
                {type}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PROVIDER_TYPES.map((t) => (
                <DropdownMenuItem
                  key={t}
                  onSelect={() => {
                    setType(t);
                  }}
                >
                  {t}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </label>
      </div>
      <label className="block">
        <span className="text-xs text-fg-muted">Base URL(必填)</span>
        <input
          type="text"
          value={baseUrl}
          placeholder="https://api.example.com/v1"
          onChange={(e) => {
            setBaseUrl(e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
        />
      </label>
      <label className="block">
        <span className="text-xs text-fg-muted">API Key(可空)</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
          }}
          className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-3 py-1.5 font-mono text-sm outline-none focus:border-brand"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-fg-muted">模型别名(至少 1 个)</span>
          <div className="flex gap-1">
            {(type === 'openai-completions' || type === 'openai_responses') && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discovering}
                onClick={() => void discover()}
              >
                <RefreshCw className={cn('size-3.5', discovering && 'animate-spin')} aria-hidden />
                获取可用模型
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setModels((rows) => [...rows, { alias: '', modelId: '', context: '128000' }]);
              }}
            >
              <Plus className="size-3.5" aria-hidden />
              加一行
            </Button>
          </div>
        </div>
        {models.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_1.4fr_80px_28px] items-center gap-1.5">
            <input
              type="text"
              value={row.alias}
              placeholder="别名"
              onChange={(e) => {
                patchRow(i, { alias: e.target.value });
              }}
              className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
            />
            <input
              type="text"
              value={row.modelId}
              placeholder="Model ID"
              onChange={(e) => {
                patchRow(i, { modelId: e.target.value });
              }}
              className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
            />
            <input
              type="text"
              value={row.context}
              placeholder="256K"
              onChange={(e) => {
                patchRow(i, { context: e.target.value });
              }}
              className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
            />
            <button
              type="button"
              aria-label="删除该行"
              onClick={() => {
                setModels((rows) => rows.filter((_, index) => index !== i));
              }}
              className="rounded p-1 text-fg-subtle transition-colors hover:bg-hover hover:text-state-error"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {discovered !== null && (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-surface-2 p-2">
          {discovered.map((candidate) => (
            <label key={candidate.id} className="flex items-center gap-2 text-xs text-fg">
              <Checkbox
                checked={candidate.checked}
                onCheckedChange={(checked) => {
                  setDiscovered((list) =>
                    (list ?? []).map((item) =>
                      item.id === candidate.id ? { ...item, checked: checked === true } : item,
                    ),
                  );
                }}
              />
              <span className="font-mono">{candidate.id}</span>
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setDiscovered(null);
              }}
            >
              取消
            </Button>
            <Button type="button" size="sm" onClick={adoptDiscovered}>
              采纳所选
            </Button>
          </div>
        </div>
      )}

      {error !== null && <p className="text-xs text-state-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={createMutation.isPending}
          onClick={() => {
            setError(null);
            if (!/^[a-z0-9][a-z0-9-]*$/.test(id.trim())) {
              setError('Provider ID 需为小写 slug(a-z、0-9、-)');
              return;
            }
            if (baseUrl.trim().length === 0) {
              setError('Base URL 必填');
              return;
            }
            const validRows = models.filter(
              (row) => row.alias.trim().length > 0 && row.modelId.trim().length > 0,
            );
            if (validRows.length === 0) {
              setError('至少填写一个模型别名(别名与 Model ID)');
              return;
            }
            for (const row of validRows) {
              if (parseContextSize(row.context) === null) {
                setError(`Context 输入无法解析:${row.context}(支持 256K / 1M / 纯数字)`);
                return;
              }
            }
            createMutation.mutate();
          }}
        >
          {createMutation.isPending ? '创建中…' : '创建'}
        </Button>
      </div>
    </div>
  );
}

// ---- Provider 卡内新增模型别名 ---------------------------------------------------

function AddModelRow(props: {
  providerId: string;
  onCancel: () => void;
  onCreated: () => void;
}): React.JSX.Element {
  const { providerId, onCancel, onCreated } = props;
  const [alias, setAlias] = useState('');
  const [modelId, setModelId] = useState('');
  const [context, setContext] = useState('128000');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createModel({
        id: alias.trim(),
        provider: providerId,
        model: modelId.trim(),
        maxContextSize: parseContextSize(context) ?? 128_000,
      }),
    onSuccess: () => {
      toast.success('模型别名已创建');
      onCreated();
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  return (
    <div className="space-y-2 rounded-md border border-border-strong bg-surface-2 p-2.5">
      <div className="grid grid-cols-[1fr_1.4fr_80px] items-center gap-1.5">
        <input
          type="text"
          value={alias}
          placeholder="别名"
          onChange={(e) => {
            setAlias(e.target.value);
          }}
          className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
        />
        <input
          type="text"
          value={modelId}
          placeholder="Model ID"
          onChange={(e) => {
            setModelId(e.target.value);
          }}
          className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
        />
        <input
          type="text"
          value={context}
          placeholder="256K"
          onChange={(e) => {
            setContext(e.target.value);
          }}
          className="w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
        />
      </div>
      {error !== null && <p className="text-xs text-state-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={createMutation.isPending}
          onClick={() => {
            setError(null);
            if (alias.trim().length === 0 || modelId.trim().length === 0) {
              setError('别名与 Model ID 必填');
              return;
            }
            if (parseContextSize(context) === null) {
              setError(`Context 输入无法解析:${context}(支持 256K / 1M / 纯数字)`);
              return;
            }
            createMutation.mutate();
          }}
        >
          {createMutation.isPending ? '创建中…' : '创建'}
        </Button>
      </div>
    </div>
  );
}

function ModelRow(props: {
  model: ConfigResponse['models'][number];
  /** 嵌在 Provider 卡内:次级底色 + 圆角缩小。 */
  nested?: boolean;
  /** 顶层展示时在行尾标出 provider 引用(未挂靠分组用)。 */
  showProvider?: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}): React.JSX.Element {
  const { model, nested, showProvider, expanded, onToggle, onChanged } = props;
  const [modelId, setModelId] = useState(model.model);
  // Context 回显完整 token 数(不做 K/M 缩写;后缀仅作为输入便利)。
  const [context, setContext] = useState(
    model.maxContextSize !== undefined ? String(model.maxContextSize) : '',
  );
  const [capabilities, setCapabilities] = useState<Set<string>>(() => seedModelCapabilities(model));

  const saveMutation = useMutation({
    mutationFn: () => {
      const size = parseContextSize(context) ?? 128_000;
      return api.updateModel(model.id, {
        model: modelId.trim(),
        maxContextSize: size,
        capabilities: [...capabilities],
      });
    },
    onSuccess: () => {
      onChanged();
      toast.success('模型别名已保存');
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
  });

  const toggleCapability = (tag: string, enabled: boolean): void => {
    setCapabilities((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(tag);
      else next.delete(tag);
      return next;
    });
  };

  const setThinkingKind = (kind: ThinkingKind): void => {
    setCapabilities((prev) => {
      const next = new Set(prev);
      for (const tag of THINKING_TAGS) next.delete(tag);
      for (const tag of THINKING_KINDS.find((o) => o.kind === kind)?.tags ?? []) {
        next.add(tag);
      }
      return next;
    });
  };

  const removeMutation = useMutation({
    mutationFn: () => api.removeModel(model.id),
    onSuccess: () => {
      onChanged();
      toast.success('模型别名已删除');
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
  });

  return (
    <div
      className={cn(
        'border border-border',
        nested ? 'rounded-md bg-surface-2' : 'rounded-lg bg-surface-1',
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="shrink-0 font-mono text-sm text-fg">{model.id}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
          {model.model}
        </span>
        {showProvider && <span className="shrink-0 text-xs text-fg-subtle">{model.provider}</span>}
        <ChevronDown
          className={cn(
            'size-3.5 shrink-0 text-fg-subtle transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border px-3 py-2.5">
          <div className="grid grid-cols-[1.4fr_80px] gap-1.5">
            <label className="block">
              <span className="text-xs text-fg-muted">Model ID</span>
              <input
                type="text"
                value={modelId}
                onChange={(e) => {
                  setModelId(e.target.value);
                }}
                className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="text-xs text-fg-muted">Context</span>
              <input
                type="text"
                value={context}
                placeholder="256K"
                onChange={(e) => {
                  setContext(e.target.value);
                }}
                className="mt-1 w-full rounded-md border border-border-strong bg-input-fill px-2 py-1 font-mono text-xs outline-none focus:border-brand"
              />
            </label>
          </div>
          <div className="space-y-2">
            <div>
              <span className="text-xs text-fg-muted">能力(工具 / 媒体)</span>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {MEDIA_CAPABILITIES.map(({ tag, label }) => (
                  <label key={tag} className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Checkbox
                      checked={capabilities.has(tag)}
                      onCheckedChange={(checked) => {
                        toggleCapability(tag, checked === true);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs text-fg-muted">推理能力</span>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                  思考能力
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md border border-border-strong bg-input-fill px-2 py-0.5 text-left text-xs text-fg"
                      >
                        {THINKING_KINDS.find((o) => o.kind === thinkingKindOf(capabilities))?.label}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {THINKING_KINDS.map(({ kind, label }) => (
                        <DropdownMenuItem
                          key={kind}
                          onSelect={() => {
                            setThinkingKind(kind);
                          }}
                        >
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </label>
                {thinkingKindOf(capabilities) !== 'unsupported' && (
                  <>
                    <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Checkbox
                        checked={capabilities.has('thinking_xhigh')}
                        onCheckedChange={(checked) => {
                          toggleCapability('thinking_xhigh', checked === true);
                        }}
                      />
                      超高(xhigh)
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                      <Checkbox
                        checked={capabilities.has('thinking_max')}
                        onCheckedChange={(checked) => {
                          toggleCapability('thinking_max', checked === true);
                        }}
                      />
                      最高(max)
                    </label>
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-fg-subtle">
                已用注册表自动识别预填(与手写标签取并集,只能加不能减);多数模型保存前无需改动。
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={removeMutation.isPending}
              onClick={() => {
                removeMutation.mutate();
              }}
              className="text-state-error hover:bg-state-error/10"
            >
              <Trash2 className="size-3.5" aria-hidden />
              删除别名
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saveMutation.isPending}
              onClick={() => {
                saveMutation.mutate();
              }}
            >
              {saveMutation.isPending ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
