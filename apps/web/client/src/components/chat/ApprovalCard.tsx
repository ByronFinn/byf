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
    <div className="rounded-xl border border-state-warning/40 bg-state-warning/5 p-3">
      <div className="mb-1 flex items-center gap-2 text-sm">
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-state-warning"
          aria-hidden
        />
        <span className="font-mono text-state-warning">{request.toolName}</span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-muted">{request.action}</span>
      </div>
      {summary !== null && <div className="mb-2 font-mono text-xs text-fg-muted">{summary}</div>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('approved')}
          className="rounded-md bg-brand px-3 py-1 text-sm text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('approved', 'session')}
          className="rounded-md border border-brand/60 px-3 py-1 text-sm text-brand hover:bg-hover disabled:opacity-50"
        >
          Approve · this session
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => void decide('rejected')}
          className="rounded-md border border-state-error/60 px-3 py-1 text-sm text-state-error hover:bg-hover disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
