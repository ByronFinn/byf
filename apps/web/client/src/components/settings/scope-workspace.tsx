/**
 * MCP / Skill 设置页签共享的工作区 scope 选择(PRD-0036 R-N2)。
 *
 * 「本地」scope 需要目标工作区:默认取当前活跃会话的 workDir,无活跃会话
 * 回退第一个已注册工作区;用户切换后保持。两个页签共享同一选择(状态提升
 * 在 SettingsDialog)。MCP 与 skill 的本地根可能不同(MCP = 工作区目录;
 * skill = 最近 .git 祖先),各组按实际路径显示(R-N4)。
 */
import { ChevronDown } from 'lucide-react';

import { Button } from '#/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import type { WorkspaceView } from '#/types';

/** 两页签共享的 scope 上下文(由 SettingsDialog 注入)。 */
export interface ScopeTabProps {
  readonly workspaces: readonly WorkspaceView[];
  readonly scopeWorkDir: string | undefined;
  readonly onScopeWorkDirChange: (workDir: string) => void;
}

/** 工作区下拉(R-N2):切换本地 scope 的目标工作区。 */
export function WorkspaceScopeBar({
  workspaces,
  scopeWorkDir,
  onScopeWorkDirChange,
}: ScopeTabProps): React.JSX.Element {
  const current = workspaces.find((w) => w.workDir === scopeWorkDir);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
      <span>本地作用域工作区</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-80 justify-between gap-6">
            <span className="min-w-0 truncate">{current?.title ?? '未选择'}</span>
            <ChevronDown className="size-3 shrink-0 text-fg-subtle" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>工作区</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuCheckboxItem
              key={w.workDir}
              checked={w.workDir === scopeWorkDir}
              onSelect={() => {
                onScopeWorkDirChange(w.workDir);
              }}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-fg">{w.title}</span>
                <span className="truncate text-xs text-fg-subtle">{w.workDir}</span>
              </span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** 无任何已注册工作区时的本地组空态(R-N2)。 */
export function NoWorkspaceHint(): React.JSX.Element {
  return (
    <div className="rounded-md border border-state-warning bg-surface-2 p-3 text-sm text-fg-muted">
      尚未注册任何工作区:请先在左侧边栏添加工作区,再管理其本地 MCP / Skill 配置。
    </div>
  );
}
