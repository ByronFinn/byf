import { ArrowUp, File, Folder, Square } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '#/api';
import { Button } from '#/components/ui/button';
import { Toaster } from '#/components/ui/toaster';
import { replaceToken, tokenAt } from '#/lib/input-trigger';
import { cn } from '#/lib/utils';
import type { FsEntry } from '#/types';

export const COMPOSER_MIN_HEIGHT_PX = 40;
export const COMPOSER_MAX_HEIGHT_PX = 192;

/** slash 命令(不含 / 前缀);`run(args)` 由页面层提供,args 为选中时行内剩余参数。 */
export interface TriggerCommand {
  readonly name: string;
  readonly description: string;
  readonly run: (args: string) => void | Promise<void>;
}

export interface ComposerTriggerOptions {
  /** slash 命令列表。 */
  readonly commands: readonly TriggerCommand[];
  /** @ 浏览根目录(工作区);null 时禁用 @ 触发。 */
  readonly workDir: string | null;
}

type TriggerState =
  | { readonly type: 'slash'; readonly query: string; readonly highlight: number }
  | {
      readonly type: 'mention';
      readonly query: string;
      readonly highlight: number;
      readonly path: string;
      readonly entries: readonly FsEntry[];
      readonly loading: boolean;
    }
  | null;

/**
 * 输入卡片(对齐 deepseek 的浮动胶囊输入):单一容器、唯一一道边框,textarea
 * 无内边框,底部一行 tools(左)/ trailing(右)。hero 与会话内共用;差异只在
 * 外层宿主与传入的底栏 chips / 输入触发选项。
 *
 * 输入触发(deepseek InputTrigger 的 combobox 模式):行首或空格后的 `/`
 * 弹出命令面板(过滤匹配、↑↓ 选择、Enter 执行、Esc 关闭);`@` 弹出工作区
 * 目录浏览(文件夹进入、文件插入 `@path ` 文本——与 TUI mention 同一约定,
 * agent 侧把路径文本当作引用)。
 */
export function ComposerCard(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSend: (text: string) => void;
  /** busy 时发送换成 Stop(仍可输入,仅不可发送)。 */
  busy?: boolean;
  onCancel?: () => void;
  /** 底栏左侧 chips 区(权限 chip 等)。 */
  leading?: React.ReactNode;
  /** 底栏右侧模型 chip。 */
  model?: string;
  /** 附加禁用发送条件(如 hero 未选工作区)。 */
  sendDisabled?: boolean;
  error?: string | null;
  minHeightPx?: number;
  maxHeightPx?: number;
  /** 输入触发选项(缺省 = 无 / 与 @ 菜单)。 */
  trigger?: ComposerTriggerOptions;
}): React.JSX.Element {
  const {
    value,
    onChange,
    placeholder,
    onSend,
    busy = false,
    onCancel,
    leading,
    model,
    sendDisabled = false,
    error,
    minHeightPx = COMPOSER_MIN_HEIGHT_PX,
    maxHeightPx = COMPOSER_MAX_HEIGHT_PX,
    trigger,
  } = props;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [triggerState, setTriggerState] = useState<TriggerState>(null);
  const commands = trigger?.commands ?? [];
  const workDir = trigger?.workDir ?? null;

  /** mirror 式自动增高:内容变化时按 scrollHeight 收缩/增高,夹在 min/max。 */
  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (el === null) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, minHeightPx), maxHeightPx);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden';
  }, [minHeightPx, maxHeightPx]);

  useEffect(() => {
    resize();
  }, [value, resize]);

  // 触发检测:value 变化时按光标前 token 开/关菜单
  const updateTrigger = (nextValue: string): void => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? nextValue.length;
    const token = tokenAt(nextValue, caret);
    if (token !== null && token.token.startsWith('/')) {
      const query = token.token.slice(1);
      setTriggerState((prev) =>
        prev?.type === 'slash' && prev.query === query
          ? prev
          : { type: 'slash', query, highlight: 0 },
      );
    } else if (token !== null && token.token.startsWith('@') && workDir !== null) {
      const query = token.token.slice(1);
      setTriggerState((prev) => {
        if (prev?.type === 'mention' && prev.query === query) return prev;
        // query 变化(过滤词):保留已加载的目录浏览状态,只换过滤词;
        // 全新触发:重置为根目录并请求。
        if (prev?.type === 'mention') return { ...prev, query, highlight: 0 };
        return { type: 'mention', query, highlight: 0, path: '', entries: [], loading: true };
      });
    } else {
      setTriggerState(null);
    }
  };

  // @ 目录数据:path 变化时请求该层
  useEffect(() => {
    if (
      triggerState?.type !== 'mention' ||
      trigger?.workDir === null ||
      trigger?.workDir === undefined
    ) {
      return;
    }
    let cancelled = false;
    setTriggerState((prev) => (prev?.type === 'mention' ? { ...prev, loading: true } : prev));
    void api
      .listFs(trigger.workDir, triggerState.path)
      .then((entries) => {
        if (cancelled) return;
        setTriggerState((prev) =>
          prev?.type === 'mention' && prev.path === triggerState.path
            ? { ...prev, entries, loading: false, highlight: 0 }
            : prev,
        );
      })
      .catch(() => {
        if (cancelled) return;
        setTriggerState((prev) =>
          prev?.type === 'mention' ? { ...prev, entries: [], loading: false } : prev,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [triggerState?.type === 'mention' ? triggerState.path : null, trigger?.workDir]);

  const slashItems =
    triggerState?.type === 'slash'
      ? commands.filter(
          (c) =>
            c.name.startsWith(triggerState.query) || c.description.includes(triggerState.query),
        )
      : [];
  const mentionItems =
    triggerState?.type === 'mention'
      ? triggerState.entries.filter(
          (e) =>
            triggerState.query.length === 0 ||
            e.name.toLowerCase().startsWith(triggerState.query.toLowerCase()),
        )
      : [];
  const activeItems = triggerState?.type === 'slash' ? slashItems : mentionItems;

  /** 执行下标 index 的 slash 命令或 mention 选择;成功后清除 token 与菜单。 */
  const pick = (index: number): void => {
    if (triggerState === null) return;
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? value.length;
    if (triggerState.type === 'slash') {
      const item = slashItems[index];
      if (item === undefined) return;
      // 命令参数 = token 后、光标前的行内文本(如 `/research 主题` → `主题`);
      // token 连同参数一起清出输入框(参数已作为命令参数消费,TUI 同语义)。
      const token = tokenAt(value, caret);
      const args = (token?.args ?? '').trim();
      const next = replaceToken(value, caret, '');
      onChange(next.value);
      setTriggerState(null);
      void item.run(args);
    } else {
      const item = mentionItems[index];
      if (item === undefined) return;
      if (item.isDir) {
        setTriggerState((prev) =>
          prev?.type === 'mention'
            ? { ...prev, path: item.path, query: '', highlight: 0, entries: [], loading: true }
            : prev,
        );
      } else {
        const next = replaceToken(value, caret, `@${item.path} `);
        onChange(next.value);
        setTriggerState(null);
      }
    }
  };

  const submit = (): void => {
    const text = value.trim();
    if (text.length === 0 || busy || sendDisabled) return;
    onSend(text);
  };

  const canSend = value.trim().length > 0 && !busy && !sendDisabled;

  return (
    <div className="relative rounded-2xl border border-border bg-input-fill px-3 pt-2.5 pb-1.5 shadow-1 transition-colors focus-within:border-brand">
      {/* toast 出口:absolute bottom-full 浮在输入框上方(不遮挡输入区) */}
      <Toaster />
      <div className="relative">
        {triggerState !== null && (
          <div
            role="listbox"
            aria-label={triggerState.type === 'slash' ? '命令' : '引用文件'}
            className="absolute right-0 bottom-full left-0 z-20 mb-2 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-3"
          >
            {triggerState.type === 'slash' ? (
              slashItems.length === 0 ? (
                <p className="px-3 py-1.5 text-xs text-fg-subtle">
                  无匹配命令(TUI 命令如 /login /goal 需在终端使用)
                </p>
              ) : (
                slashItems.map((c, i) => (
                  <button
                    key={c.name}
                    type="button"
                    role="option"
                    aria-selected={i === triggerState.highlight}
                    onMouseDown={(e) => {
                      e.preventDefault(); // 保持 textarea 焦点(combobox 模式)
                      pick(i);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                      i === triggerState.highlight ? 'bg-active text-fg' : 'text-fg-muted',
                    )}
                  >
                    <span className="font-medium text-fg">/{c.name}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-fg-subtle">
                      {c.description}
                    </span>
                  </button>
                ))
              )
            ) : (
              <>
                <div className="flex items-center gap-1 border-b border-border px-3 py-1 text-xs text-fg-subtle">
                  <button
                    type="button"
                    disabled={triggerState.path.length === 0}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setTriggerState((prev) =>
                        prev?.type === 'mention'
                          ? { ...prev, path: '', query: '', highlight: 0 }
                          : prev,
                      );
                    }}
                    className={cn(
                      'truncate hover:text-fg',
                      triggerState.path.length === 0 && 'opacity-60',
                    )}
                  >
                    {workDir !== null
                      ? triggerState.path.length === 0
                        ? workDir.split(/[/\\]/).at(-1)
                        : triggerState.path
                      : ''}
                  </button>
                  {triggerState.loading && <span className="ml-auto animate-pulse">加载中…</span>}
                </div>
                {mentionItems.length === 0 && !triggerState.loading ? (
                  <p className="px-3 py-1.5 text-xs text-fg-subtle">空目录</p>
                ) : (
                  mentionItems.map((e, i) => (
                    <button
                      key={e.path}
                      type="button"
                      role="option"
                      aria-selected={i === triggerState.highlight}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pick(i);
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                        i === triggerState.highlight ? 'bg-active text-fg' : 'text-fg-muted',
                      )}
                    >
                      {e.isDir ? (
                        <Folder className="size-4 shrink-0 text-fg-muted" aria-hidden />
                      ) : (
                        <File className="size-4 shrink-0 text-fg-muted" aria-hidden />
                      )}
                      <span className="truncate">{e.name}</span>
                      {e.isDir && <span className="ml-auto text-xs text-fg-subtle">文件夹</span>}
                    </button>
                  ))
                )}
              </>
            )}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            updateTrigger(e.target.value);
          }}
          onKeyDown={(e) => {
            // IME 组合态的 Enter(确认候选词)不发送
            if (e.nativeEvent.isComposing) return;
            if (triggerState !== null) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setTriggerState((prev) =>
                  prev === null
                    ? prev
                    : {
                        ...prev,
                        highlight: Math.min(
                          prev.highlight + 1,
                          Math.max(activeItems.length - 1, 0),
                        ),
                      },
                );
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setTriggerState((prev) =>
                  prev === null ? prev : { ...prev, highlight: Math.max(prev.highlight - 1, 0) },
                );
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setTriggerState(null);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(triggerState.highlight);
              }
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          aria-label="Message"
          placeholder={placeholder}
          className="block w-full resize-none border-0 bg-transparent text-base leading-relaxed outline-none placeholder:text-fg-subtle"
          style={{ height: minHeightPx }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1.5">
          {leading}
          {error !== null && error !== undefined && (
            <span className="min-w-0 truncate text-xs text-state-error">{error}</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {model !== undefined && (
            <span
              className="flex h-7 max-w-40 items-center truncate rounded-full px-2 font-mono text-xs text-fg-muted"
              title={`model: ${model}`}
            >
              {model}
            </span>
          )}
          {busy ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="gap-1.5 text-state-error"
            >
              <Square aria-hidden />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              onClick={submit}
              disabled={!canSend}
              aria-label="发送消息"
              className="rounded-full"
            >
              <ArrowUp aria-hidden />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
