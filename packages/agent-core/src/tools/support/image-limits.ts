/**
 * 按 owner 的图片摄入预算(最长边、读入口字节预算)。
 *
 * 每个 owner(Agent / 独立 core)一个实例。模块状态中不存任何内容,
 * 因此一个进程内的两个 core 各按自己的 `[image]` 设置压缩,
 * 重载其一不会重新盖印另一个。
 *
 * 解析优先级:**env > 所属配置 > 内置默认**。env 覆盖是操作员级
 * (进程范围,如 `BYF_IMAGE_MAX_EDGE_PX`);配置层按 owner
 * (来自 config.toml 的 `[image]`)。
 *
 * 所有图片摄入入口共用——`ReadMediaFile`、CLI 粘贴、MCP 图片输出——
 * 因此不会出现「工具压缩了但粘贴没压缩」。
 */

import {
  MAX_IMAGE_EDGE_PX,
  READ_IMAGE_BYTE_BUDGET,
  maxImageEdgeFromEnv,
  readImageByteBudgetFromEnv,
} from './image-compress';

export interface ImageConfig {
  readonly maxEdgePx?: number;
  readonly readByteBudget?: number;
}

export class ImageLimits {
  constructor(
    private readonly env: Readonly<Record<string, string | undefined>> = process.env,
    private config: ImageConfig | undefined = undefined,
  ) {}

  setConfig(config: ImageConfig | undefined): void {
    this.config = config;
  }

  /** 解码后图像允许保留的最长边(像素)。 */
  maxEdgePx(): number {
    return maxImageEdgeFromEnv(this.env) ?? this.config?.maxEdgePx ?? MAX_IMAGE_EDGE_PX;
  }

  /** 读入口(解码 / 压缩前)的原始文件字节预算。 */
  readByteBudget(): number {
    return (
      readImageByteBudgetFromEnv(this.env) ?? this.config?.readByteBudget ?? READ_IMAGE_BYTE_BUDGET
    );
  }
}
