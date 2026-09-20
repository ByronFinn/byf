export type UIMode = 'shell' | 'print';
export type PromptOutputFormat = 'text' | 'stream-json';

export interface CLIOptions {
  session: string | undefined;
  continue: boolean;
  yolo: boolean;
  /**
   * PRD-0038 AC-1.6(Q2 裁决):headless 下遇到需要审批的工具时不静默批准,
   * 而是拒绝并以专用退出码 `7` 失败。显式覆盖配置里的 `default_permission_mode`。
   */
  denyUnapproved: boolean;
  model: string | undefined;
  outputFormat: PromptOutputFormat | undefined;
  prompt: string | undefined;
  skillsDirs: string[];
  addDirs: string[];
}

export interface ValidatedOptions {
  options: CLIOptions;
  uiMode: UIMode;
}

export class OptionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OptionConflictError';
  }
}

export function validateOptions(opts: CLIOptions): ValidatedOptions {
  const prompt = opts.prompt;
  const promptMode = prompt !== undefined;
  if (promptMode && prompt.trim().length === 0) {
    throw new OptionConflictError('Prompt cannot be empty.');
  }
  if (opts.model !== undefined && opts.model.trim().length === 0) {
    throw new OptionConflictError('Model cannot be empty.');
  }
  if (!promptMode && opts.outputFormat !== undefined) {
    throw new OptionConflictError('Output format is only supported in prompt mode.');
  }
  // PRD-0038 AC-1.6:旧的 `Cannot combine --prompt with --yolo.` 已移除——它制造
  // "headless 受管控"的反向错觉(打印模式其实恒批准)。显式 --yolo/--approve-all
  // 在 --prompt 下合法,含义就是"这一轮全放行"。
  if (promptMode && opts.session === '') {
    throw new OptionConflictError('Cannot use --session without an id in prompt mode.');
  }
  if (opts.continue && opts.session !== undefined) {
    throw new OptionConflictError('Cannot combine --continue, --session.');
  }
  if (!promptMode && (opts.continue || opts.session !== undefined) && opts.yolo) {
    throw new OptionConflictError('Cannot combine --yolo with --continue or --session.');
  }
  return { options: opts, uiMode: promptMode ? 'print' : 'shell' };
}
