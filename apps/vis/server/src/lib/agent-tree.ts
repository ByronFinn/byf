import type { AgentInfo } from './agent-record-types';

export interface AgentNode extends AgentInfo {
  children: AgentNode[];
}

/**
 * 从 `state.json.agents` 上的扁平 agent 清单构建父子树。根是无
 * `parentAgentId` 的 agent,加上任何 `parentAgentId` 在清单中无法解析的
 * agent(孤儿)。返回的根已排序,使 `main` agent 总是首先出现;其余根
 * 回退到稳定的字典序。
 */
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
