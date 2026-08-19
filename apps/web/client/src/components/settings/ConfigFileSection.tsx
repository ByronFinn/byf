/**
 * 配置文件页（PRD-0035 R-E1~R-E4 / ADR-0038）：config.toml 全文编辑。
 *
 * - 编辑器：textarea + 行号 gutter（T5 降级方案；错误定位能力不降级）。
 * - 状态行：绝对路径 / revision / valid|invalid；操作 Refresh / Validate / Save /
 *   Copy path / Reveal in OS。
 * - 密钥：服务端已掩码（占位符）；保存原样占位符 = 保留磁盘原值，输入新值 =
 *   更新，删除行 = 删除 key（R-E6，无明文回显）。
 * - 冲突：Save 携带 expectedRevision；409 展示冲突提示并提供「重新载入磁盘版本」
 *   与「复制磁盘版本」（R-E3，不提供 force）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { configApi, type ConfigDocumentWire } from '#/api';
import { Button } from '#/components/ui/button';
import { toast } from '#/lib/toast';

const MASK_PLACEHOLDER = '__BYF_KEEP_SECRET__';

interface ConfigFileSectionProps {
  /** 打开时立即加载磁盘版本（含掩码）。 */
  onLoaded?: (doc: ConfigDocumentWire) => void;
}

export function ConfigFileSection({ onLoaded }: ConfigFileSectionProps): React.JSX.Element {
  const [doc, setDoc] = useState<ConfigDocumentWire | null>(null);
  const [text, setText] = useState('');
  const [revision, setRevision] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [diagnostics, setDiagnostics] = useState<
    { message: string; line?: number; column?: number }[]
  >([]);
  const [valid, setValid] = useState<boolean | null>(null);
  const [conflict, setConflict] = useState<{ diskRevision: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const gutterRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await configApi.getConfigDocument();
      setDoc(d);
      setText(d.text);
      setRevision(d.revision);
      setPath(d.path);
      setValid(null);
      setDiagnostics([]);
      setConflict(null);
      onLoaded?.(d);
    } catch (error) {
      toast.error(`读取配置失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [onLoaded]);

  useEffect(() => {
    void load();
  }, [load]);

  // 行号 gutter（与 textarea 同步滚动）
  const lineCount = useMemo(() => text.split('\n').length, [text]);

  const syncScroll = (): void => {
    if (gutterRef.current !== null && areaRef.current !== null) {
      gutterRef.current.scrollTop = areaRef.current.scrollTop;
    }
  };

  const validate = useCallback(async (): Promise<boolean> => {
    try {
      const result = await configApi.validateConfigText(text);
      setValid(result.valid);
      setDiagnostics(result.diagnostics);
      return result.valid;
    } catch (error) {
      toast.error(`校验失败：${(error as Error).message}`);
      return false;
    }
  }, [text]);

  const save = async (): Promise<void> => {
    setSaving(true);
    setConflict(null);
    try {
      const ok = await validate();
      if (!ok) {
        toast.error('配置无效，未写入磁盘（定位见下方 diagnostics）');
        return;
      }
      const { revision: nextRevision } = await configApi.writeConfigText(text, revision);
      setRevision(nextRevision);
      setText(text); // 服务端原样写回；本地保持编辑内容
      toast.success('已保存 config.toml');
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('revision')) {
        setConflict({ diskRevision: null });
        toast.error('配置冲突：文件已被其他进程修改（TUI/CLI？）');
      } else {
        toast.error(`保存失败：${message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const copyPath = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('复制失败');
    }
  };

  const reveal = async (): Promise<void> => {
    try {
      const res = await fetch('/api/config/reveal', { method: 'POST' });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
    } catch (error) {
      toast.error(`打开失败：${(error as Error).message}`);
    }
  };

  if (loading && doc === null) {
    return <div className="p-4 font-mono text-xs text-fg-subtle">config.toml 加载中…</div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-fg">配置文件</h3>
        <p className="mt-1 text-sm text-fg-muted">
          config.toml 全文编辑（原样写回：注释/空行/未识别键全保真）。 密钥值已掩码（保存原样占位符
          = 保留磁盘原值；输入新值 = 更新；删除行 = 删除密钥）。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <code className="rounded border border-border bg-surface-2 px-1.5 py-0.5">{path}</code>
        <span className="font-mono">
          revision: <span className="text-fg-1">{revision ?? 'null（文件不存在）'}</span>
        </span>
        {valid !== null && (
          <span className={valid ? 'text-state-success' : 'text-state-error'}>
            {valid ? '● valid' : '● invalid'}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          刷新
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => void validate()}>
          校验
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || text.length === 0}
          onClick={() => void save()}
        >
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copyPath()}>
          {copied ? '已复制' : '复制路径'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void reveal()}>
          在文件管理器中显示
        </Button>
      </div>

      {conflict !== null && (
        <div className="rounded-md border border-state-warning bg-surface-2 p-3 text-sm">
          <p className="font-medium text-state-warning">保存冲突：文件已被其他进程修改</p>
          <p className="mt-1 text-fg-muted">
            请重新载入磁盘版本（你的编辑会丢失）或手动合并后再保存。不提供强制覆盖。
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void load()}
          >
            重新载入磁盘版本
          </Button>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="max-h-28 overflow-y-auto rounded-md border border-state-error bg-surface-2 p-2 font-mono text-xs text-state-error">
          {diagnostics.map((d, i) => (
            <div key={i} className="py-0.5">
              {d.line !== undefined ? `L${d.line}:${d.column ?? 1} ` : ''}
              {d.message}
            </div>
          ))}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-surface-2">
        <div
          ref={gutterRef}
          aria-hidden
          className="w-10 shrink-0 select-none overflow-hidden border-r border-border bg-surface-1 py-2 text-right font-mono text-[11px] leading-5 text-fg-3"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i} className="pr-2">
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={areaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setValid(null);
          }}
          onScroll={syncScroll}
          spellCheck={false}
          className="min-w-0 flex-1 resize-none bg-transparent p-2 font-mono text-[12px] leading-5 text-fg-0 outline-none"
          aria-label="config.toml 全文编辑器"
        />
      </div>
    </div>
  );
}

export { MASK_PLACEHOLDER };
