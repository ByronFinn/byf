import { useEffect, useReducer } from 'react';
import { useParams } from 'react-router-dom';

import { api } from '#/api';
import { ApprovalCard } from '#/components/chat/ApprovalCard';
import { Composer } from '#/components/chat/Composer';
import { QuestionCard } from '#/components/chat/QuestionCard';
import { StatusBar } from '#/components/chat/StatusBar';
import { Transcript } from '#/components/chat/Transcript';
import { useEventStream } from '#/hooks/useEventStream';
import { chatReducer, initialChatState } from '#/lib/chat';

export function ChatPage(): React.JSX.Element {
  const params = useParams();
  const sessionId = params['sessionId'];
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);

  useEventStream(sessionId, (frame) => {
    dispatch({ type: 'frame', frame });
  });

  useEffect(() => {
    if (sessionId === undefined || sessionId.length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        await api.resumeSession(sessionId);
        const { status } = await api.getSession(sessionId);
        if (!cancelled) dispatch({ type: 'status-loaded', status });
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: 'frame',
            frame: {
              type: 'sys.error',
              message: error instanceof Error ? error.message : 'failed to load session',
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const onSend = (text: string): void => {
    dispatch({ type: 'user-message', text });
    if (sessionId !== undefined) void api.prompt(sessionId, text);
  };

  const onCancel = (): void => {
    if (sessionId !== undefined) void api.cancel(sessionId);
  };

  if (sessionId === undefined) {
    return <div className="p-6 text-sm text-fg-muted">No session id in the URL.</div>;
  }

  const approvalIds = Object.keys(state.pendingApprovals);
  const questionIds = Object.keys(state.pendingQuestions);

  return (
    <div className="flex h-full flex-col">
      <StatusBar
        sessionId={sessionId}
        status={state.status}
        busy={state.busy}
        connected={state.connected}
        onCancel={onCancel}
      />
      <div className="min-h-0 flex-1">
        <Transcript entries={state.entries} />
      </div>
      {(approvalIds.length > 0 || questionIds.length > 0) && (
        <div className="max-h-64 overflow-y-auto border-t border-border bg-surface-2 px-4 py-3">
          <div className="mx-auto max-w-3xl space-y-3">
            {approvalIds.map((id) => (
              <ApprovalCard
                key={id}
                sessionId={sessionId}
                requestId={id}
                request={state.pendingApprovals[id]!}
              />
            ))}
            {questionIds.map((id) => (
              <QuestionCard
                key={id}
                sessionId={sessionId}
                requestId={id}
                request={state.pendingQuestions[id]!}
              />
            ))}
          </div>
        </div>
      )}
      <Composer disabled={state.busy} onSend={onSend} />
    </div>
  );
}
