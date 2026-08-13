/**
 * loginProviderRegistry — /login 提供方类型选项的唯一事实源。
 *
 * 只包含 base-URL 传播端到端可用的类型。`google-genai` / `vertexai`
 * 刻意省略(ADR 0016):其运行时提供方不消费用户提供的 baseUrl。
 *
 * login-flow.ts 中的 `API_TYPE_OPTIONS` 与 `DEFAULT_BASE_URL` 查找
 * 均派生自本注册表。
 */

/** 单个可登录提供方类型的静态条目。 */
export interface LoginProviderRegistryEntry {
  /** 选择器中展示的人类可读标签。 */
  readonly label: string;
  /** 官方默认 base URL(用户留空输入时使用)。 */
  readonly defaultBaseUrl: string;
}

export const loginProviderRegistry = {
  'openai-completions': {
    label: 'OpenAI Chat Completions 兼容',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  openai_responses: {
    label: 'OpenAI Responses API',
    defaultBaseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    label: 'Anthropic 原生',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
  },
} as const;

export type LoginProviderType = keyof typeof loginProviderRegistry;

/** 由注册表键派生的选项数组——可安全传给 ChoicePicker。 */
export function getLoginProviderOptions(): ReadonlyArray<{
  value: LoginProviderType;
  label: string;
  description: string;
}> {
  return Object.entries(loginProviderRegistry).map(([k, { label, defaultBaseUrl }]) => ({
    value: k as LoginProviderType,
    label,
    description: defaultBaseUrl,
  }));
}
