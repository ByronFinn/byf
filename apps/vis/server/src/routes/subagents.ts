import { Hono } from 'hono';

import { BYF_HOME } from '../config';
import { buildAgentTree } from '../lib/agent-tree';
import { readSessionDetail } from '../lib/session-store';

export function subagentsRoute(): Hono {
  const r = new Hono();
  r.get('/:id/agents', async (c) => {
    const id = c.req.param('id');
    const detail = await readSessionDetail(BYF_HOME, id);
    if (!detail) {
      return c.json({ error: 'session not found', code: 'NOT_FOUND' }, 404);
    }
    return c.json({ sessionId: id, tree: buildAgentTree(detail.agents) });
  });
  return r;
}
