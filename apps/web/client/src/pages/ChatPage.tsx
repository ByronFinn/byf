import { BookOpen, FolderSearch, ListChecks, Sparkles } from 'lucide-react';
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

const EXAMPLE_PROMPTS: readonly { icon: typeof BookOpen; label: string; prompt: string }[] = [
  {
    icon: BookOpen,
    label: 'Summarize this repo',
    prompt: 'Read the README at the repo root and summarize what this project does in 5 bullets.',
  },
  {
    icon: FolderSearch,
    label: 'Find TODOs',
    prompt: 'Search the src directory for TODO comments and list them grouped by file.',
  },
  {
    icon: ListChecks,
    label: 'Explain the structure',
    prompt: 'Walk through the top-level directory structure of this project and explain each part.',
  },
];

export function ChatPage(): React.JSX.Element {
  const params = useParams();
  const sessionId = params['sessionId'];
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);

  useEventStream(sessionId, (frame) => {
    dispatch({ type: 'frame', frame });
  });

  useEffect(() => {
    if (sessionId === undefined || sessionId.length === 0) return;
    // 会话切换由 App 层 key 重挂组件(reducer 重建),此处只需加载新会话状态
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
      />
      <div className="min-h-0 flex-1">
        {state.entries.length === 0 ? (
          <EmptyState onPick={onSend} />
        ) : (
          <Transcript entries={state.entries} busy={state.busy} />
        )}
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
      <Composer
        disabled={state.busy}
        model={state.status?.model}
        onSend={onSend}
        onCancel={onCancel}
      />
    </div>
  );
}

/** 空状态 hero(R13):欢迎屏 + 示例 prompt。 */
function EmptyState({ onPick }: { onPick: (prompt: string) => void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-on-brand shadow-2"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        <h1 className="text-xl font-semibold text-fg">Hi, I'm byf</h1>
      </div>
      <p className="mt-2 max-w-md text-center text-sm text-fg-muted">
        Your agent in the browser — send a message, or start with one of these:
      </p>
      <div className="mt-6 grid w-full max-w-lg gap-2">
        {EXAMPLE_PROMPTS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onPick(prompt);
            }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-left text-sm text-fg-muted shadow-1 transition-colors hover:border-brand/50 hover:bg-surface-2 hover:text-fg"
          >
            <Icon className="size-4 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-fg">{label}</span>
              <span className="block truncate text-xs text-fg-subtle">{prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
