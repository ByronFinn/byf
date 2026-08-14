import { useState } from 'react';

import { api } from '#/api';
import { summarizeDisplay } from '#/lib/tool-display';
import type { ApprovalRequest } from '#/types';

export function ApprovalCard(props: {
  sessionId: string;
  requestId: string;
  request: ApprovalRequest;
}): React.JSX.Element {
  const { sessionId, requestId, request } = props;
  const [submitting, setSubmitting] = useState(false);
  const summary = summarizeDisplay(request.display);

  const decide = async (decision: 'approved' | 'rejected', scope?: 'session'): Promise<void> => {
    setSubmitting(true);
    try {
      await api.resolveApproval(sessionId, requestId, { decision, scope });
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400"
          aria-hidden
        />
        <span className="font-mono text-amber-300">{request.toolName}</span>
        <span className="text-zinc-500">·</span>
        <span className="text-zinc-400">{request.action}</span>
      </div>
      {summary !== null && <div className="mb-2 font-mono text-xs text-zinc-400">{summary}</div>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('approved')}
          className="rounded-md bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('approved', 'session')}
          className="rounded-md border border-emerald-600/60 px-3 py-1 text-sm text-emerald-300 hover:bg-emerald-600/10 disabled:opacity-50"
        >
          Approve · this session
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('rejected')}
          className="rounded-md border border-rose-600/60 px-3 py-1 text-sm text-rose-300 hover:bg-rose-600/10 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
