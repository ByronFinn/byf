/**
 * 粘贴图片的 transcript 侧渲染。
 *
 * 在支持 Kitty 图形协议或 iTerm2 内联图片协议的终端上(由 pi-tui 的
 * `getCapabilities()` 检测),显示实际图片。其他环境回退为与用户在输入框
 * 所见一致的单行文本标记——使 transcript 在 Terminal.app / Linux 默认
 * 终端 / `script` 录制中无需额外 chrome 即可阅读。
 *
 * 高度上限约 12 行,使单个截图不会独占视口;比例缩放由 pi-tui 内部处理。
 */

import { Container, Image, Text, type ImageTheme, getCapabilities } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import type { ImageAttachment } from '#/tui/utils/image-attachment-store';

const MAX_IMAGE_ROWS = 12;
const MAX_IMAGE_WIDTH = 40;

export class ImageThumbnail extends Container {
  constructor(
    attachment: ImageAttachment,
    colors: ColorPalette,
    options: { readonly maxRows?: number; readonly maxWidth?: number } = {},
  ) {
    super();

    const caps = getCapabilities();
    const supportsInline = caps.images === 'kitty' || caps.images === 'iterm2';

    if (!supportsInline) {
      // Non-graphic terminal — show the placeholder text in dim cyan so
      // it's clearly an attachment reference but doesn't shout.
      this.addChild(new Text(chalk.hex(colors.accent)(attachment.placeholder), 0, 0));
      return;
    }

    const theme: ImageTheme = {
      fallbackColor: (s: string) => chalk.hex(colors.textDim)(s),
    };
    const base64 = Buffer.from(attachment.bytes).toString('base64');
    const image = new Image(
      base64,
      attachment.mime,
      theme,
      {
        maxHeightCells: options.maxRows ?? MAX_IMAGE_ROWS,
        maxWidthCells: options.maxWidth ?? MAX_IMAGE_WIDTH,
        filename: attachment.placeholder,
      },
      { widthPx: attachment.width, heightPx: attachment.height },
    );
    this.addChild(image);
  }
}
