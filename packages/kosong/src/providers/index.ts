import type { ChatProvider } from '../provider';
import { AnthropicChatProvider, type AnthropicOptions } from './anthropic';
import { GoogleGenAIChatProvider, type GoogleGenAIOptions } from './google-genai';
import { OpenAICompletionsChatProvider, type OpenAICompletionsOptions } from './openai-completions';
import { OpenAILegacyChatProvider, type OpenAILegacyOptions } from './openai-legacy';
import { OpenAIResponsesChatProvider, type OpenAIResponsesOptions } from './openai-responses';
import { OpenAICompatChatProvider, type OpenAICompatOptions } from './openai-compat';

export { OpenAICompletionsChatProvider } from './openai-completions';
export type { OpenAICompletionsOptions } from './openai-completions';
export { OpenAICompatChatProvider } from './openai-compat';
export type { OpenAICompatOptions } from './openai-compat';

export type ProviderConfig =
  | ({ type: 'anthropic' } & AnthropicOptions)
  | ({ type: 'openai' } & OpenAILegacyOptions)
  | ({ type: 'openai-compat' } & OpenAICompatOptions)
  | ({ type: 'openai-completions' } & OpenAICompletionsOptions)
  | ({ type: 'google-genai' } & GoogleGenAIOptions)
  | ({ type: 'openai_responses' } & OpenAIResponsesOptions)
  | ({ type: 'vertexai' } & GoogleGenAIOptions);

export type ProviderType = ProviderConfig['type'];

export function createProvider(config: ProviderConfig): ChatProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicChatProvider(config);
    case 'openai':
      return new OpenAILegacyChatProvider(config);
    case 'openai-compat':
      return new OpenAICompatChatProvider(config);
    case 'openai-completions':
      return new OpenAICompletionsChatProvider(config);
    case 'google-genai':
      return new GoogleGenAIChatProvider(config);
    case 'openai_responses':
      return new OpenAIResponsesChatProvider(config);
    case 'vertexai':
      return new GoogleGenAIChatProvider(config);
    default: {
      const exhaustive: never = config;
      throw new Error(`Unknown provider type: ${String(exhaustive)}`);
    }
  }
}
