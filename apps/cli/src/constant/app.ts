import { ErrorCodes } from '@byfriends/sdk';

export const PRODUCT_NAME = 'BYF';
export const CLI_COMMAND_NAME = 'byf';

// 用于 HTTP User-Agent 头。
export const CLI_USER_AGENT_PRODUCT = 'byf-cli';
export const CLI_UI_MODE = 'shell';

// 发布的 npm 包名;它可能不同于可执行命令名。
export const NPM_PACKAGE_NAME = '@byfriends/cli';

// 应用自有数据路径。SDK/core 运行时配置刻意不路由到此。
export const BYF_HOME_ENV = 'BYF_HOME';
export const BYF_DATA_DIR_NAME = '.byf';
export const BYF_LOG_DIR_NAME = 'logs';
export const BYF_UPDATE_DIR_NAME = 'updates';
export const BYF_UPDATE_STATE_FILE_NAME = 'latest.json';
export const BYF_INPUT_HISTORY_DIR_NAME = 'user-history';

// SDK/core error code that tells the TUI to show a login-required startup
// notice. Derived from sdk's ErrorCodes so a future rename in core
// auto-propagates instead of silently breaking the startup recovery path.
export const OAUTH_LOGIN_REQUIRED_CODE = ErrorCodes.AUTH_LOGIN_REQUIRED;

export const FEEDBACK_ISSUE_URL = 'https://github.com/ByronFinn/byf/issues';

// Sent in the feedback `version` field so the backend can distinguish this
// TypeScript client from clients that send a bare version.
export const FEEDBACK_VERSION_PREFIX = 'byf-';

// GitHub Releases is the source of truth for install scripts and update checks.
export const BYF_RELEASES_BASE = 'https://github.com/ByronFinn/byf/releases';
export const BYF_RELEASES_LATEST_URL = 'https://api.github.com/repos/ByronFinn/byf/releases/latest';
export const BYF_RELEASES_INSTALL_SH_URL = `${BYF_RELEASES_BASE}/latest/download/install.sh`;
export const BYF_RELEASES_INSTALL_PS1_URL = `${BYF_RELEASES_BASE}/latest/download/install.ps1`;

// Native install commands, split by platform. Use these for prompt copy and spawn calls only; do not assemble the strings elsewhere.
export const NATIVE_INSTALL_COMMAND_UNIX = `curl -fsSL ${BYF_RELEASES_INSTALL_SH_URL} | bash`;
export const NATIVE_INSTALL_COMMAND_WIN = `irm ${BYF_RELEASES_INSTALL_PS1_URL} | iex`;

/** 强制退出已完成的 headless(`byf -p`)运行前的宽限期。 */
export const HEADLESS_FORCE_EXIT_GRACE_MS = 2000;

/** 武装 headless 强制退出前,等待 stdout/stderr 排空的最长时间。 */
export const HEADLESS_STDIO_DRAIN_TIMEOUT_MS = 10000;

/** headless 清理上限,使卡死的关停不会永远挂起。 */
export const PROMPT_CLEANUP_TIMEOUT_MS = 15_000;
