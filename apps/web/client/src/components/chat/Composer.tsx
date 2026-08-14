import { useState } from 'react';

import { ComposerCard } from '#/components/chat/ComposerCard';
import { PermissionChip } from '#/components/chat/PermissionChip';
import type { PermissionMode } from '#/types';

/**
 * 会话内输入区:ComposerCard(浮动胶囊,无全宽描边铺垫)+ 权限 chip 于
 * 底栏左侧(对齐 deepseek 的 PermissionSelect 座位)。Enter 发送,Shift+Enter
 * 换行;busy 时发送换成 Stop。
 */
export function Composer(props: {
  disabled: boolean;
  model: string | undefined;
  permission: PermissionMode | undefined;
  onPermissionChange: (mode: PermissionMode) => Promise<void> | void;
  onSend: (text: string) => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { disabled, model, permission, onPermissionChange, onSend, onCancel } = props;
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
          leading={<PermissionChip mode={permission ?? 'manual'} onChange={onPermissionChange} />}
        />
      </div>
    </div>
  );
}
