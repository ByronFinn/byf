import { useState } from 'react';

import {
  ComposerCard,
  type ComposerImage,
  type TriggerCommand,
} from '#/components/chat/ComposerCard';
import { ModelChip } from '#/components/chat/ModelChip';
import { PermissionChip } from '#/components/chat/PermissionChip';
import { ThinkingChip } from '#/components/chat/ThinkingChip';
import type { PermissionMode, ThinkingEffort } from '#/types';

/**
 * 会话内输入区:ComposerCard(浮动胶囊,无全宽描边铺垫)+ 权限 chip 与
 * 思考 chip 于底栏左侧(权限对齐 deepseek PermissionSelect 座位;思考为
 * 会话内推理强度切换)+ 模型 chip 于底栏右侧(会话内模型切换)。输入触发
 * (/ 命令面板与 @ 文件引用)由页面层提供命令集与工作区根目录。Enter 发送,
 * Shift+Enter 换行;busy 时发送换成 Stop。
 *
 * 图片附件状态在此持有(hero 无附件能力):粘贴经 ComposerCard 的 onAddImage
 * 进队,发送时连同文本一起交给页面层,发送后清空。
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
  onModelChange: (model: string) => Promise<void> | void;
  onSend: (text: string, images: readonly ComposerImage[]) => void;
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
    onModelChange,
    onSend,
    onCancel,
  } = props;
  const [text, setText] = useState('');
  const [images, setImages] = useState<ComposerImage[]>([]);

  return (
    <div className="px-4 pt-1 pb-3">
      <div className="mx-auto max-w-3xl">
        <ComposerCard
          value={text}
          onChange={setText}
          placeholder={
            disabled
              ? 'Agent 正在工作…（可点停止打断）'
              : '给 byf 发消息…（Enter 发送，Shift+Enter 换行）'
          }
          onSend={(value) => {
            onSend(value, images);
            setText('');
            setImages([]);
          }}
          busy={disabled}
          onCancel={onCancel}
          modelChip={<ModelChip model={model} onChange={onModelChange} />}
          images={images}
          onAddImage={(dataUrl) => {
            setImages((prev) => [...prev, { id: `img-${Date.now()}-${prev.length}`, dataUrl }]);
          }}
          onRemoveImage={(id) => {
            setImages((prev) => prev.filter((img) => img.id !== id));
          }}
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
