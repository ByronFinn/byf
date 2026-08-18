/**
 * Skill 配置页签(PRD-0036)。
 *
 * - 按 本地(project)/全局(user)/额外(extra)/内置(builtin)分组列出各 skill
 *   root 发现的 skill:名称、描述、所在目录、来源标记(R-S1)。
 * - 同名 first-wins:被遮蔽定义显示「被遮蔽」标记(本地遮蔽全局时,全局侧
 *   标注)。
 * - builtin/extra 与 `.agents/skills`(跨工具共享目录)标注只读及原因;
 *   byf 只写 `.byf/skills`。
 * - skill 的本地根 = 最近 `.git` 祖先(可能与 MCP 页签的工作区目录不同,
 *   R-N4);新建/删除影响下次会话加载(R-N3)。
 * - 新建(R-S2,#315):scope 选择(全局/本地)+ 名称/描述,模板生成
 *   SKILL.md bundle;同 scope 同名报错,跨 scope 同名提示遮蔽方向。
 * - 删除(R-S3):二次确认;仅 user/project 的 `.byf/skills` 条目可删
 *   (服务端 realpath 前缀校验,builtin/extra/`.agents` 一律拒绝)。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { skillApi } from '#/api';
import {
  NoWorkspaceHint,
  WorkspaceScopeBar,
  type ScopeTabProps,
} from '#/components/settings/scope-workspace';
import { Button } from '#/components/ui/button';
import { ConfirmDialog } from '#/components/ui/confirm-dialog';
import { errorMessage, toast } from '#/lib/toast';
import type { WorkspaceSkillEntry, WorkspaceSkillGroup, WorkspaceSkillRoot } from '#/types';

const GROUP_META: Record<string, { title: string; hint: string }> = {
  project: { title: '本地(工作区)', hint: '项目 `.byf/skills` 与 `.agents/skills`。' },
  user: { title: '全局', hint: '用户主目录下的 `.byf/skills` 与 `.agents/skills`。' },
  extra: { title: '额外目录', hint: 'config.toml `extra_skill_dirs` 配置的目录,只读。' },
  builtin: { title: '内置', hint: 'byf 内置 skill,只读。' },
};

export function SkillSettingsSection(props: ScopeTabProps): React.JSX.Element {
  const { scopeWorkDir } = props;
  const enabled = scopeWorkDir !== undefined;
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-skills', scopeWorkDir],
    queryFn: () => skillApi.list(scopeWorkDir!),
    enabled,
  });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WorkspaceSkillEntry | null>(null);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['workspace-skills', scopeWorkDir] });
  };

  const removeMutation = useMutation({
    mutationFn: (skill: WorkspaceSkillEntry) => skillApi.remove(scopeWorkDir!, skill.path),
    onSuccess: () => {
      setDeleting(null);
      toast.success('已删除 skill(影响下次会话加载)');
      invalidate();
    },
    onError: (error: Error) => {
      toast.error(`删除失败:${errorMessage(error)}`);
    },
  });

  return (
    <section aria-label="Skill 配置" className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-fg">Skill 配置</h2>
          <p className="mt-1 text-xs text-fg-subtle">
            按作用域列出各 skill root 发现的 skill;同名时靠前的 root 遮蔽后者。新建 / 删除影响
            <b className="text-fg-1">下次会话</b>加载。byf 只写 `.byf/skills`; `.agents/skills`
            是跨工具共享目录,只读。
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-6 shrink-0 px-2 text-[11px]"
          disabled={!enabled}
          onClick={() => {
            setCreating(true);
          }}
        >
          新建 skill
        </Button>
      </div>

      {props.workspaces.length === 0 && <NoWorkspaceHint />}

      {enabled && (
        <>
          <WorkspaceScopeBar {...props} />
          {data !== undefined && (
            <p className="text-[11px] text-fg-subtle">
              skill 本地根(最近 `.git` 祖先,可能与 MCP 页签的工作区目录不同):
              <code className="font-mono">{data.projectRoot}</code>
            </p>
          )}
          {isLoading && <p className="text-xs text-fg-subtle">加载中…</p>}
          {data !== undefined && (
            <div className="space-y-3">
              {data.groups.map((group) => (
                <SkillGroupView
                  key={group.scope}
                  group={group}
                  onDelete={(skill) => {
                    setDeleting(skill);
                  }}
                />
              ))}
              {data.groups.length === 0 && (
                <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
                  未发现任何 skill root。
                </p>
              )}
            </div>
          )}
        </>
      )}

      {creating && (
        <CreateSkillDialog
          workDir={scopeWorkDir!}
          onCancel={() => {
            setCreating(false);
          }}
          onCreated={(warning) => {
            setCreating(false);
            invalidate();
            if (warning !== undefined) toast.info(warning);
          }}
        />
      )}

      {deleting !== null && (
        <ConfirmDialog
          title="删除 skill"
          message={`确定删除「${deleting.name}」?${
            deleting.path.endsWith('SKILL.md') ? '整个 skill 目录' : '该 skill 文件'
          }将被移除,影响下次会话加载。`}
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

function SkillGroupView(props: {
  readonly group: WorkspaceSkillGroup;
  readonly onDelete: (skill: WorkspaceSkillEntry) => void;
}): React.JSX.Element {
  const { group, onDelete } = props;
  const meta = GROUP_META[group.scope] ?? { title: group.scope, hint: '' };
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <h3 className="shrink-0 text-xs font-medium text-fg-muted">{meta.title}</h3>
        <span className="min-w-0 flex-1 truncate text-[11px] text-fg-subtle">{meta.hint}</span>
      </div>
      {group.roots.map((root) => (
        <RootLine key={root.path} root={root} />
      ))}
      {group.skills.length === 0 && (
        <p className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-fg-subtle">
          暂无 skill。
        </p>
      )}
      {group.skills.length > 0 && (
        <ul className="space-y-1">
          {group.skills.map((skill) => (
            <li
              key={skill.path}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm text-fg">{skill.name}</span>
                  {skill.shadowed === true && (
                    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                      被遮蔽
                    </span>
                  )}
                  {!skill.writable && (
                    <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[10px] text-fg-muted">
                      只读
                    </span>
                  )}
                </span>
                <span className="truncate text-[11px] text-fg-subtle" title={skill.description}>
                  {skill.description}
                </span>
                <span className="truncate font-mono text-[10px] text-fg-subtle" title={skill.path}>
                  {skill.dir}
                </span>
              </span>
              {skill.writable && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 shrink-0 px-2 text-[11px] text-state-error"
                  onClick={() => {
                    onDelete(skill);
                  }}
                >
                  删除
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RootLine({ root }: { readonly root: WorkspaceSkillRoot }): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-2">
      <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-subtle">
        {root.path}
      </code>
      {!root.writable && (
        <span className="shrink-0 text-[10px] text-fg-subtle">
          {root.path.includes('.agents') ? '跨工具共享目录,byf 只读' : '非 byf 自有目录,只读'}
        </span>
      )}
    </div>
  );
}

const INPUT_CLS =
  'w-full rounded-md border border-border-strong bg-input-fill px-2.5 py-1.5 text-sm outline-none focus:border-brand';

/** 新建 skill 对话框:scope 选择 + 名称/描述,模板生成 SKILL.md bundle。 */
function CreateSkillDialog(props: {
  readonly workDir: string;
  readonly onCancel: () => void;
  readonly onCreated: (warning?: string) => void;
}): React.JSX.Element {
  const [scope, setScope] = useState<'user' | 'project'>('project');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (): Promise<void> => {
    if (name.trim().length === 0 || description.trim().length === 0) {
      toast.error('名称与描述均不能为空');
      return;
    }
    setSaving(true);
    try {
      const result = await skillApi.create(props.workDir, {
        scope,
        name: name.trim(),
        description: description.trim(),
      });
      toast.success('已创建 skill(下次会话加载生效)');
      props.onCreated(result.warning);
    } catch (error) {
      toast.error(`创建失败:${errorMessage(error)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={props.onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label="新建 skill"
        className="relative w-[440px] rounded-xl border border-border bg-popover p-4 shadow-3"
      >
        <h2 className="text-sm font-semibold text-fg">新建 skill</h2>
        <p className="mt-1 text-[11px] text-fg-subtle">
          以模板生成 SKILL.md(frontmatter name/description + 正文骨架);编辑正文请用
          文件端点或外部编辑器。同 scope 同名不允许;跨 scope 同名会遮蔽全局。
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <span className="text-xs text-fg-muted">作用域</span>
            <div className="mt-1 flex gap-2">
              {(
                [
                  { value: 'project', label: '本地(项目 .byf/skills)' },
                  { value: 'user', label: '全局(~/.byf/skills)' },
                ] as const
              ).map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant={scope === option.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setScope(option.value);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs text-fg-muted">名称(即目录名)</span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className={`mt-1 ${INPUT_CLS} font-mono`}
              placeholder="例如 deploy-helper"
            />
          </label>
          <label className="block">
            <span className="text-xs text-fg-muted">描述</span>
            <input
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              className={`mt-1 ${INPUT_CLS}`}
              placeholder="一句话说明该 skill 做什么"
            />
          </label>
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
            {saving ? '创建中…' : '创建'}
          </Button>
        </div>
      </div>
    </div>
  );
}
