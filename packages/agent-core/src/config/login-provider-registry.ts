/**
 * loginProviderRegistry — single source of truth for /login provider type choices.
 *
 * Only includes types whose base-URL propagation is end-to-end functional.
 * `google-genai` / `vertexai` are deliberately omitted (ADR 0016): their runtime
 * providers do not consume a user-supplied baseUrl.
 *
 * The `API_TYPE_OPTIONS` in login-flow.ts and `DEFAULT_BASE_URL` lookup are
 * both derived from this registry.
 */

/** Static entry for one login-capable provider type. */
export interface LoginProviderRegistryEntry {
  /** Human-readable label shown in the choice picker. */
  readonly label: string;
  /** Official default base URL (used when user leaves the input empty). */
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

/** Choices array derived from registry keys — safe to pass to ChoicePicker. */
export function getLoginProviderOptions(): ReadonlyArray<{
  value: LoginProviderType;
  label: string;
  description: string;
}> {
  return Object.entries(loginProviderRegistry).map(([value, { label, defaultBaseUrl }]) => ({
    value,
    label,
    description: defaultBaseUrl,
  }));
}
