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
 */
import { useQuery } from '@tanstack/react-query';

import { skillApi } from '#/api';
import {
  NoWorkspaceHint,
  WorkspaceScopeBar,
  type ScopeTabProps,
} from '#/components/settings/scope-workspace';
import type { WorkspaceSkillGroup, WorkspaceSkillRoot } from '#/types';

const GROUP_META: Record<string, { title: string; hint: string }> = {
  project: { title: '本地(工作区)', hint: '项目 `.byf/skills` 与 `.agents/skills`。' },
  user: { title: '全局', hint: '用户主目录下的 `.byf/skills` 与 `.agents/skills`。' },
  extra: { title: '额外目录', hint: 'config.toml `extra_skill_dirs` 配置的目录,只读。' },
  builtin: { title: '内置', hint: 'byf 内置 skill,只读。' },
};

export function SkillSettingsSection(props: ScopeTabProps): React.JSX.Element {
  const { scopeWorkDir } = props;
  const enabled = scopeWorkDir !== undefined;
  const { data, isLoading } = useQuery({
    queryKey: ['workspace-skills', scopeWorkDir],
    queryFn: () => skillApi.list(scopeWorkDir!),
    enabled,
  });

  return (
    <section aria-label="Skill 配置" className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Skill 配置</h2>
        <p className="mt-1 text-xs text-fg-subtle">
          按作用域列出各 skill root 发现的 skill;同名时靠前的 root 遮蔽后者。新建 / 删除影响
          <b className="text-fg-1">下次会话</b>加载。byf 只写 `.byf/skills`; `.agents/skills`
          是跨工具共享目录,只读。
        </p>
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
                <SkillGroupView key={group.scope} group={group} />
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
    </section>
  );
}

function SkillGroupView({ group }: { readonly group: WorkspaceSkillGroup }): React.JSX.Element {
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
