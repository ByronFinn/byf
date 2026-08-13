// 使用 U+25CF 而非 U+23FA,避免终端中的 emoji / 回退渲染。
export const STATUS_BULLET = '● ';

// 共享 transcript 标记。保持宽度稳定,因为消息换行假定标记占据前导单元。
export const USER_MESSAGE_BULLET = '✨ ';
export const FAILURE_MARK = '✗ ';
