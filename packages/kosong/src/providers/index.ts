import type { ChatProvider } from '../provider';
import { AnthropicChatProvider, type AnthropicOptions } from './anthropic';
import { GoogleGenAIChatProvider, type GoogleGenAIOptions } from './google-genai';
import { OpenAICompletionsChatProvider, type OpenAICompletionsOptions } from './openai-completions';
import { OpenAIResponsesChatProvider, type OpenAIResponsesOptions } from './openai-responses';

export { OpenAICompletionsChatProvider } from './openai-completions';
export type { OpenAICompletionsOptions } from './openai-completions';

export type ProviderConfig =
  | ({ type: 'anthropic' } & AnthropicOptions)
  | ({ type: 'openai-completions' } & OpenAICompletionsOptions)
  | ({ type: 'google-genai' } & GoogleGenAIOptions)
  | ({ type: 'openai_responses' } & OpenAIResponsesOptions)
  | ({ type: 'vertexai' } & GoogleGenAIOptions);

export type ProviderType = ProviderConfig['type'];

export function createProvider(config: ProviderConfig): ChatProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicChatProvider(config);
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
