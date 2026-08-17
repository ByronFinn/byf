/**
 * Agent 树：从 `state.json.agents` 的扁平清单构建父子树。
 *
 * 由 `apps/vis/server/src/lib/agent-tree.ts` 上移（PRD-0035 R-A1）。
 */

import type { AgentInfo, AgentNode } from './types';

/** 根是无 `parentAgentId` 的 agent + 任何 parent 在清单中无法解析的 agent
 *  （孤儿）。根排序使 `main` 总是首先出现，其余回退到稳定字典序。 */
export function buildAgentTree(agents: ReadonlyArray<AgentInfo>): AgentNode[] {
  const byId = new Map<string, AgentNode>();
  for (const a of agents) byId.set(a.agentId, { ...a, children: [] });

  const roots: AgentNode[] = [];
  for (const node of byId.values()) {
    if (node.parentAgentId !== null && byId.has(node.parentAgentId)) {
      byId.get(node.parentAgentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots.toSorted(sortAgents);
}

function sortAgents(a: AgentNode, b: AgentNode): number {
  if (a.agentId === 'main') return -1;
  if (b.agentId === 'main') return 1;
  return a.agentId.localeCompare(b.agentId);
}
