import { describe, expect, test } from 'bun:test';

import {
  deriveWorkspaceTree,
  reconcileOrder,
  DEFAULT_VIEW,
  type WorkspaceViewState,
} from '../src/lib/workspace-tree';
import type { SessionSummary, WorkspaceView } from '../src/types';

function session(id: string, workDir: string, updatedAt: number): SessionSummary {
  return { id, workDir, sessionDir: `/tmp/${id}`, createdAt: 0, updatedAt, title: id };
}

function workspace(workDir: string, sessions: SessionSummary[]): WorkspaceView {
  return { workDir, title: workDir.split('/').pop() ?? workDir, sessions };
}

const WS1 = '/a';
const WS2 = '/b';
const S1 = 's1';
const S2 = 's2';
const S3 = 's3';
const S4 = 's4';

const data = [
  workspace(WS1, [session(S1, WS1, 100), session(S2, WS1, 200), session(S3, WS1, 300)]),
  workspace(WS2, [session(S4, WS2, 50)]),
];

function view(patch: Partial<WorkspaceViewState> = {}): WorkspaceViewState {
  return { ...DEFAULT_VIEW, ...patch };
}

/**
 * deriveWorkspaceTree 守护:侧边栏全部呈现逻辑(分组/排序/搜索/展开)都在
 * 这里;deepseek 的 zero-or-five 折叠语义(收起 = 0 行)是核心回归防线。
 */
describe('deriveWorkspaceTree', () => {
  test('展开的组给出全部会话与 sessionCount;收起的组 0 行但 sessionCount 保留', () => {
    const { groups } = deriveWorkspaceTree(
      data,
      view({ expanded: { [WS1]: false, [WS2]: true } }),
      '',
      undefined,
    );
    const g1 = groups.find((g) => g.workDir === WS1);
    const g2 = groups.find((g) => g.workDir === WS2);
    expect(g1?.expanded).toBe(false);
    expect(g1?.sessions).toEqual([]);
    expect(g1?.sessionCount).toBe(3);
    expect(g2?.expanded).toBe(true);
    expect(g2?.sessions.map((n) => n.id)).toEqual([S4]);
    expect(g2?.sessionCount).toBe(1);
  });

  test('activeId 所在组默认展开(无持久化展开状态时)', () => {
    const { groups } = deriveWorkspaceTree(data, view(), '', S4);
    expect(groups.find((g) => g.workDir === WS2)?.expanded).toBe(true);
    expect(groups.find((g) => g.workDir === WS2)?.containsCurrent).toBe(true);
  });

  test('最近更新排序:按组内最新会话倒序,平手按注册表序', () => {
    const { groups } = deriveWorkspaceTree(data, view(), '', undefined);
    expect(groups.map((g) => g.workDir)).toEqual([WS1, WS2]); // 300 > 50
    const tied = [
      workspace('/x', [session('x1', '/x', 10)]),
      workspace('/y', [session('y1', '/y', 10)]),
    ];
    const { groups: tiedGroups } = deriveWorkspaceTree(tied, view(), '', undefined);
    expect(tiedGroups.map((g) => g.workDir)).toEqual(['/x', '/y']); // 注册表序
  });

  test('手动排序:存储序对账 + 新项补尾', () => {
    const { groups } = deriveWorkspaceTree(
      data,
      view({ orderBy: 'manual', workspaceOrder: [WS2, WS1] }),
      '',
      undefined,
    );
    expect(groups.map((g) => g.workDir)).toEqual([WS2, WS1]);
    // 组内会话:倒序存储(手动序);显式展开以读取行
    const { groups: inner } = deriveWorkspaceTree(
      data,
      view({
        orderBy: 'manual',
        expanded: { [WS1]: true },
        sessionOrders: { [WS1]: [S3, S1, S2] },
      }),
      '',
      undefined,
    );
    expect(inner.find((g) => g.workDir === WS1)?.sessions.map((n) => n.id)).toEqual([S3, S1, S2]);
    // 存储序含已消失 id:对账剔除,新 id 补尾
    const { groups: reconciled } = deriveWorkspaceTree(
      data,
      view({
        orderBy: 'manual',
        expanded: { [WS1]: true },
        sessionOrders: { [WS1]: [S3, 'ghost', S1] },
      }),
      '',
      undefined,
    );
    expect(reconciled.find((g) => g.workDir === WS1)?.sessions.map((n) => n.id)).toEqual([
      S3,
      S1,
      S2,
    ]);
  });

  test('搜索:无匹配的组隐藏;无搜索时空工作区保留组行', () => {
    const withEmpty = [...data, workspace('/empty', [])];
    const idle = deriveWorkspaceTree(withEmpty, view(), '', undefined);
    expect(idle.groups.some((g) => g.workDir === '/empty')).toBe(true);

    const searching = deriveWorkspaceTree(
      withEmpty,
      view({ expanded: { [WS1]: true } }),
      's2',
      undefined,
    );
    expect(searching.groups.map((g) => g.workDir)).toEqual([WS1]);
    expect(searching.groups[0]?.sessions.map((n) => n.id)).toEqual([S2]);
  });

  test('单列表:手动序 / 最近更新序平铺全部会话', () => {
    const { flat } = deriveWorkspaceTree(data, view({ groupBy: 'flat' }), '', undefined);
    expect(flat.map((n) => n.id)).toEqual([S3, S2, S1, S4]); // 最近更新倒序

    const { flat: manualFlat } = deriveWorkspaceTree(
      data,
      view({ groupBy: 'flat', orderBy: 'manual', flatOrder: [S4, S1, S3, S2] }),
      '',
      undefined,
    );
    expect(manualFlat.map((n) => n.id)).toEqual([S4, S1, S3, S2]);
  });
});

describe('reconcileOrder', () => {
  test('空存储 → 原序;存储去重;新 id 补尾', () => {
    expect(reconcileOrder(['a', 'b'], undefined)).toEqual(['a', 'b']);
    expect(reconcileOrder(['a', 'b', 'c'], ['b', 'b', 'a'])).toEqual(['b', 'a', 'c']);
    expect(reconcileOrder(['a', 'b'], ['b'])).toEqual(['b', 'a']);
  });
});
