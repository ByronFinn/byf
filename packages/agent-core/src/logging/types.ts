export type LogLevel = 'off' | 'error' | 'warn' | 'info' | 'debug';

export type LogContext = Record<string, unknown>;

/**
 * `log.error / warn / info / debug` 的第二个参数。
 *
 * 三种用法形态,运行时检测:
 *   - `Error`     → 堆栈被提取到条目上
 *   - `LogContext`(对象) → 合并进条目上下文;若含 `{ error: Error }`,
 *                          该字段会被取出并提取其堆栈(bunyan 风格)
 *   - `unknown`   → 通常是 `catch` 绑定;是 Error 实例则按 Error 处理,
 *                   否则字符串化为 `reason` 字段
 */
export type LogPayload = unknown;

export interface Logger {
  error(message: string, payload?: LogPayload): void;
  warn(message: string, payload?: LogPayload): void;
  info(message: string, payload?: LogPayload): void;
  debug(message: string, payload?: LogPayload): void;
  /**
   * 返回一个新 logger,为其发出的每条条目添加 `ctx`。绑定上下文优先于
   * 每次调用的负载上下文,使调用方不会意外覆盖 `sessionId` / `agentId`
   * 等归属字段:
   *
   *   finalCtx = { ...payloadCtx, ...boundCtx }
   *
   * 子级可链式继承——`parent.createChild({a: 1}).createChild({b: 2})`
   * 同时绑定两者。
   */
  createChild(ctx: LogContext): Logger;
}

export interface LogEntry {
  readonly t: number;
  readonly level: Exclude<LogLevel, 'off'>;
  readonly msg: string;
  readonly ctx?: LogContext;
  readonly error?: { readonly message: string; readonly stack?: string };
  readonly sessionId?: string;
  readonly sessionLogId?: string;
}

export interface LoggingConfig {
  readonly level: LogLevel;
  readonly globalLogPath: string;
  readonly globalMaxBytes: number;
  readonly globalFiles: number;
  readonly sessionMaxBytes: number;
  readonly sessionFiles: number;
}

export interface SessionLogHandle {
  readonly logger: Logger;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface SessionAttachInput {
  readonly sessionId: string;
  readonly sessionDir: string;
}

export interface RootLogger {
  configure(config: LoggingConfig): Promise<void>;
  attachSession(input: SessionAttachInput): SessionLogHandle;
  /** 任一 sink 未能刷出待处理批次时为 false。 */
  flush(): Promise<boolean>;
  /** 全局 sink 未能刷出时为 false;无全局 sink 时为 true。 */
  flushGlobal(): Promise<boolean>;
  /** 会话 sink 未能刷出时为 false;无活跃 sink 时为 true。 */
  flushSession(sessionId: string): Promise<boolean>;
  flushSync(): void;
  isConfigured(): boolean;
  getConfig(): LoggingConfig | undefined;
}

export const LOG_LEVEL_RANK: Record<LogLevel, number> = {
  off: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

export function levelEnabled(threshold: LogLevel, level: Exclude<LogLevel, 'off'>): boolean {
  return LOG_LEVEL_RANK[threshold] >= LOG_LEVEL_RANK[level];
}
