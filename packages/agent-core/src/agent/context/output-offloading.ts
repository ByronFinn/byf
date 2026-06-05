import { estimateTokens } from '../../utils/tokens';
import type { ExecutableToolResult } from '../../loop/types';
import type { ScratchManager } from './scratch-manager';

export interface OffloadingConfig {
  /** 触发卸载的 token 阈值，默认 8000 */
  threshold: number;
  /** 预览字符数，默认 1000 */
  previewChars: number;
}

export const DEFAULT_OFFLOADING_CONFIG: OffloadingConfig = {
  threshold: 8000,
  previewChars: 1000,
};

export interface OffloadResult {
  offloaded: boolean;
  /** 如果 offloaded=true，这是替换后的输出 */
  output?: string;
  /** 原始输出文件路径 */
  filePath?: string;
}

export function shouldOffload(
  output: string,
  config: OffloadingConfig = DEFAULT_OFFLOADING_CONFIG,
): boolean {
  return estimateTokens(output) > config.threshold;
}

export async function offloadOutput(
  toolCallId: string,
  toolName: string,
  result: ExecutableToolResult,
  scratchManager: ScratchManager,
  config: OffloadingConfig = DEFAULT_OFFLOADING_CONFIG,
): Promise<OffloadResult> {
  const output = result.output;
  if (typeof output !== 'string') {
    return { offloaded: false };
  }

  if (!shouldOffload(output, config)) {
    return { offloaded: false };
  }

  const filePath = await scratchManager.writeOutput(toolCallId, output);
  const preview = buildPreview(output, toolName, filePath, config.previewChars);

  return {
    offloaded: true,
    output: preview,
    filePath,
  };
}

export function buildPreview(
  output: string,
  toolName: string,
  filePath: string,
  previewChars: number,
): string {
  const preview = output.slice(0, previewChars);
  return `[Tool output offloaded to scratch file: ${filePath}]
Preview (first ${String(previewChars)} chars):
${preview}
Use Read(path="${filePath}") to retrieve the full output.`;
}
