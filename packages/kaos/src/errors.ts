/**
 * kaos 包的基础错误类。
 */
export class KaosError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KaosError';
  }
}

/**
 * 等价于 Python 的 ValueError——表示传入了无效参数。
 */
export class KaosValueError extends KaosError {
  constructor(message: string) {
    super(message);
    this.name = 'KaosValueError';
  }
}

/**
 * 等价于 Python 的 FileExistsError——表示文件或目录已存在。
 */
export class KaosFileExistsError extends KaosError {
  constructor(message: string) {
    super(message);
    this.name = 'KaosFileExistsError';
  }
}
