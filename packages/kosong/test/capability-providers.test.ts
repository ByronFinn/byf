/**
 * Per-provider `getCapability(model?)` table tests.
 *
 * For every provider:
 *   - Known models return the capabilities the table declares for them.
 *   - Unknown models return UNKNOWN_CAPABILITY (no throw) so the capability
 *     gate stays non-fatal when the operator uses a model the provider has
 *     not catalogued yet.
 *
 * Assertions stick to individual fields (image_in / video_in / …) rather
 * than matching the whole object so future additions (e.g. new fields in
 * `ModelCapability`) do not churn every row.
 */

import { UNKNOWN_CAPABILITY } from '#/capability';
import { AnthropicChatProvider } from '#/providers/anthropic';
import { GoogleGenAIChatProvider } from '#/providers/google-genai';
import { OpenAICompletionsChatProvider } from '#/providers/openai-completions';
import { OpenAIResponsesChatProvider } from '#/providers/openai-responses';
import { describe, expect, it } from 'vitest';
describe('OpenAICompletionsChatProvider.getCapability', () => {
  function make(model: string): OpenAICompletionsChatProvider {
    return new OpenAICompletionsChatProvider({ model, apiKey: 'test-key' });
  }

  it('does not infer capabilities from Byf model names', () => {
    for (const model of [
      'byf-for-coding',
      'byf',
      'byf-k2-turbo-preview',
      'byf-k2.5',
      'byf-thinking-preview',
    ]) {
      const cap = make(model).getCapability();
      // OpenAI providers always advertise cache capability even for unknown models
      expect(cap.cache).toBeDefined();
      expect(cap.cache?.strategy).toBe('prompt-cache-key');
      expect(cap.image_in).toBe(UNKNOWN_CAPABILITY.image_in);
      expect(cap.video_in).toBe(UNKNOWN_CAPABILITY.video_in);
      expect(cap.audio_in).toBe(UNKNOWN_CAPABILITY.audio_in);
    }
  });

  it('explicit model arg overrides this.modelName', () => {
    const provider = make('byf-k2-turbo-preview');
    const cap = provider.getCapability('byf-for-coding');
    // OpenAI providers always advertise cache capability even for unknown models
    expect(cap.cache).toBeDefined();
    expect(cap.cache?.strategy).toBe('prompt-cache-key');
    expect(cap.image_in).toBe(UNKNOWN_CAPABILITY.image_in);
    expect(cap.video_in).toBe(UNKNOWN_CAPABILITY.video_in);
    expect(cap.audio_in).toBe(UNKNOWN_CAPABILITY.audio_in);
  });

  it('unknown Byf model → UNKNOWN_CAPABILITY (no throw)', () => {
    const cap = make('some-fake-model').getCapability();
    // OpenAI providers always advertise cache capability even for unknown models
    expect(cap.cache).toBeDefined();
    expect(cap.cache?.strategy).toBe('prompt-cache-key');
    expect(cap.image_in).toBe(UNKNOWN_CAPABILITY.image_in);
    expect(cap.video_in).toBe(UNKNOWN_CAPABILITY.video_in);
    expect(cap.audio_in).toBe(UNKNOWN_CAPABILITY.audio_in);
  });
});
describe('GoogleGenAIChatProvider.getCapability', () => {
  function make(model: string): GoogleGenAIChatProvider {
    return new GoogleGenAIChatProvider({ model, apiKey: 'test-key' });
  }

  it('gemini-1.5-pro → image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-1.5-pro').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gemini-1.5-flash → image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-1.5-flash').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gemini-2.0-flash → image_in + video_in + audio_in + tool_use', () => {
    const cap = make('gemini-2.0-flash').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.video_in).toBe(true);
    expect(cap.audio_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('unknown Gemini model → UNKNOWN_CAPABILITY (no throw)', () => {
    const cap = make('gemini-not-real-xyz').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });

  it('non-gemini model name → UNKNOWN_CAPABILITY', () => {
    const cap = make('claude-3-5-sonnet').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });
});
describe('AnthropicChatProvider.getCapability', () => {
  function make(model: string): AnthropicChatProvider {
    return new AnthropicChatProvider({ model, apiKey: 'test-key', stream: false });
  }

  it('claude-3-5-sonnet → image_in + tool_use, audio_in=false', () => {
    const cap = make('claude-3-5-sonnet').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
    expect(cap.audio_in).toBe(false);
  });

  it('claude-3-haiku → image_in + tool_use, audio_in=false, thinking=false', () => {
    // Claude 3 Haiku supports vision (all Claude 3.x share vision support);
    // Anthropic has no audio models; thinking is a Claude 4 feature.
    const cap = make('claude-3-haiku').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
    expect(cap.audio_in).toBe(false);
    expect(cap.thinking).toBe(false);
  });

  it('claude-opus-4 → image_in + thinking + tool_use', () => {
    const cap = make('claude-opus-4').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('no Anthropic model supports audio_in', () => {
    // Sanity: Anthropic has no audio-input models today. If one ships later
    // and this fails, update the table — but make it a conscious decision.
    for (const m of ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-opus-4']) {
      expect(make(m).getCapability().audio_in).toBe(false);
    }
  });

  it('unknown Anthropic model → UNKNOWN_CAPABILITY', () => {
    const cap = make('claude-not-real').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });

  // --- thinking_effort / thinking_xhigh / thinking_max for Claude 4.x ---

  it('claude-opus-4-7 → thinking_effort + thinking_xhigh + thinking_max', () => {
    const cap = make('claude-opus-4-7-20250619').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(true);
    expect(cap.thinking_max).toBe(true);
  });

  it('claude-opus-4-8 → thinking_effort + thinking_xhigh + thinking_max', () => {
    const cap = make('claude-opus-4-8-20250619').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(true);
    expect(cap.thinking_max).toBe(true);
  });

  it('claude-opus-4-6 → thinking_effort + thinking_max but not thinking_xhigh', () => {
    const cap = make('claude-opus-4-6-20250619').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(false);
    expect(cap.thinking_max).toBe(true);
  });

  it('claude-sonnet-4-6 → thinking_effort + thinking_max but not thinking_xhigh', () => {
    const cap = make('claude-sonnet-4-6-20250619').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(false);
    expect(cap.thinking_max).toBe(true);
  });

  it('claude-haiku-4-5 → thinking_effort + thinking_max but not thinking_xhigh', () => {
    const cap = make('claude-haiku-4-5-20250619').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(false);
    expect(cap.thinking_max).toBe(true);
  });

  it('claude-opus-4 (base) → thinking_effort + thinking_max but not thinking_xhigh', () => {
    const cap = make('claude-opus-4').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(false);
    expect(cap.thinking_max).toBe(true);
  });

  it('Claude 3.x models do not have thinking_effort / thinking_xhigh / thinking_max', () => {
    for (const m of ['claude-3-5-sonnet', 'claude-3-haiku', 'claude-3-7-sonnet']) {
      const cap = make(m).getCapability();
      expect(cap.thinking_effort).toBe(false);
      expect(cap.thinking_xhigh).toBe(false);
      expect(cap.thinking_max).toBe(false);
    }
  });
});
describe('OpenAICompletionsChatProvider.getCapability (known models)', () => {
  function make(model: string): OpenAICompletionsChatProvider {
    return new OpenAICompletionsChatProvider({ model, apiKey: 'test-key' });
  }

  it('gpt-4o → image_in + tool_use', () => {
    const cap = make('gpt-4o').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('gpt-3.5-turbo → image_in=false, tool_use=true', () => {
    const cap = make('gpt-3.5-turbo').getCapability();
    expect(cap.image_in).toBe(false);
    expect(cap.tool_use).toBe(true);
  });

  it('o1 → thinking=true, tool_use=true', () => {
    const cap = make('o1').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('unknown OpenAI-completions model → UNKNOWN_CAPABILITY with cache', () => {
    const cap = make('gpt-mystery').getCapability();
    // OpenAI providers always advertise cache capability even for unknown models
    expect(cap.cache).toBeDefined();
    expect(cap.cache?.strategy).toBe('prompt-cache-key');
    expect(cap.image_in).toBe(UNKNOWN_CAPABILITY.image_in);
    expect(cap.video_in).toBe(UNKNOWN_CAPABILITY.video_in);
    expect(cap.audio_in).toBe(UNKNOWN_CAPABILITY.audio_in);
  });

  // --- thinking_effort for OpenAI o-series ---

  it('o3 → thinking_effort', () => {
    const cap = make('o3').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
  });

  it('o4-mini → thinking_effort', () => {
    const cap = make('o4-mini').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
  });

  it('o1 → thinking_effort', () => {
    const cap = make('o1').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
  });

  it('non-reasoning OpenAI models do not have thinking_effort', () => {
    for (const m of ['gpt-4o', 'gpt-3.5-turbo', 'gpt-4.1']) {
      const cap = make(m).getCapability();
      expect(cap.thinking_effort).toBe(false);
    }
  });
});
describe('OpenAIResponsesChatProvider.getCapability', () => {
  function make(model: string): OpenAIResponsesChatProvider {
    return new OpenAIResponsesChatProvider({ model, apiKey: 'test-key' });
  }

  it('gpt-4.1 → image_in + tool_use (Responses flagship)', () => {
    const cap = make('gpt-4.1').getCapability();
    expect(cap.image_in).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('o1 → thinking=true, tool_use=true', () => {
    const cap = make('o1').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.tool_use).toBe(true);
  });

  it('o3-mini → thinking=true', () => {
    const cap = make('o3-mini').getCapability();
    expect(cap.thinking).toBe(true);
  });

  it('unknown Responses model → UNKNOWN_CAPABILITY', () => {
    const cap = make('gpt-mystery').getCapability();
    expect(cap).toEqual(UNKNOWN_CAPABILITY);
  });

  // --- thinking_effort for OpenAI o-series (Responses path) ---

  it('o3 → thinking_effort (Responses)', () => {
    const cap = make('o3').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
  });

  it('o4-mini → thinking_effort (Responses)', () => {
    const cap = make('o4-mini').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
  });

  it('gpt-5-codex → thinking_effort + thinking_xhigh', () => {
    const cap = make('gpt-5-codex').getCapability();
    expect(cap.thinking).toBe(true);
    expect(cap.thinking_effort).toBe(true);
    expect(cap.thinking_xhigh).toBe(true);
  });

  it('non-reasoning Responses models do not have thinking_effort', () => {
    for (const m of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o']) {
      const cap = make(m).getCapability();
      expect(cap.thinking_effort).toBe(false);
    }
  });
});
