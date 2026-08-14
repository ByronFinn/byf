import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';

import { api } from '#/api';
import { Button } from '#/components/ui/button';
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
    <div className="rounded-xl border border-state-warning/40 bg-state-warning/5 p-3 shadow-1">
      <div className="mb-1 flex items-center gap-2 text-sm">
        <ShieldAlert className="size-4 shrink-0 animate-pulse text-state-warning" aria-hidden />
        <span className="font-mono text-state-warning">{request.toolName}</span>
        <span className="text-fg-muted">·</span>
        <span className="text-fg-muted">{request.action}</span>
      </div>
      {summary !== null && <div className="mb-2 font-mono text-xs text-fg-muted">{summary}</div>}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={submitting}
          onClick={() => void decide('approved')}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => void decide('approved', 'session')}
        >
          Approve · this session
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={() => void decide('rejected')}
          className="border-state-error/60 text-state-error hover:bg-hover hover:text-state-error"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
