import { useState } from 'react';

import { ComposerCard, type TriggerCommand } from '#/components/chat/ComposerCard';
import { PermissionChip } from '#/components/chat/PermissionChip';
import { ThinkingChip } from '#/components/chat/ThinkingChip';
import type { PermissionMode, ThinkingEffort } from '#/types';

/**
 * 会话内输入区:ComposerCard(浮动胶囊,无全宽描边铺垫)+ 权限 chip 与
 * 思考 chip 于底栏左侧(权限对齐 deepseek PermissionSelect 座位;思考为
 * 会话内推理强度切换)。输入触发(/ 命令面板与 @ 文件引用)由页面层提供
 * 命令集与工作区根目录。Enter 发送,Shift+Enter 换行;busy 时发送换成 Stop。
 */
export function Composer(props: {
  disabled: boolean;
  model: string | undefined;
  permission: PermissionMode | undefined;
  thinkingLevel: ThinkingEffort | 'off' | undefined;
  workDir: string | null;
  commands: readonly TriggerCommand[];
  onPermissionChange: (mode: PermissionMode) => Promise<void> | void;
  onThinkingChange: (level: ThinkingEffort | 'off') => Promise<void> | void;
  onSend: (text: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const {
    disabled,
    model,
    permission,
    thinkingLevel,
    workDir,
    commands,
    onPermissionChange,
    onThinkingChange,
    onSend,
    onCancel,
  } = props;
  const [text, setText] = useState('');

  return (
    <div className="px-4 pt-1 pb-3">
      <div className="mx-auto max-w-3xl">
        <ComposerCard
          value={text}
          onChange={setText}
          placeholder={
            disabled
              ? 'Agent is working… (Stop to interrupt)'
              : 'Message byf…  (Enter to send, Shift+Enter for newline)'
          }
          onSend={(value) => {
            onSend(value);
            setText('');
          }}
          busy={disabled}
          onCancel={onCancel}
          model={model}
          leading={
            <>
              <PermissionChip mode={permission ?? 'manual'} onChange={onPermissionChange} />
              <ThinkingChip level={thinkingLevel} onChange={onThinkingChange} />
            </>
          }
          trigger={{ commands, workDir }}
        />
      </div>
    </div>
  );
}
