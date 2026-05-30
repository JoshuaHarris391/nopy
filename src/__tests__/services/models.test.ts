import { describe, it, expect } from 'vitest'
import { getModelContextWindow } from '../../services/models'
import type { LlmConfig } from '../../types/settings'

function cfg(overrides: Partial<LlmConfig>): LlmConfig {
  return {
    provider: 'anthropic',
    apiKey: '',
    anthropicMainModel: '',
    anthropicLightweightModel: '',
    localBaseUrl: '',
    localModel: '',
    localLightweightModel: '',
    openaiApiKey: '',
    openaiModel: '',
    openaiLightweightModel: '',
    ...overrides,
  }
}

describe('getModelContextWindow', () => {
  it('detects a known hosted model window from the static map', () => {
    /**
     * Hosted providers don't report their context window via the model-list
     * API, so we map known ids. A recognised Anthropic model resolves to its
     * 200k window, flagged as detected.
     * Input: anthropic + a mapped model id
     * Expected output: { tokens: 200000, source: 'detected' }
     */
    expect(getModelContextWindow(cfg({ provider: 'anthropic', anthropicMainModel: 'claude-sonnet-4-5-20250514' })))
      .toEqual({ tokens: 200_000, source: 'detected' })
  })

  it('falls back to a safe default for an unknown hosted model', () => {
    /**
     * Model ids drift; an unmapped id must not crash the budget bar. It falls
     * back to the provider default, flagged as default so the UI can say
     * "estimated".
     * Input: anthropic + an unmapped model id
     * Expected output: { tokens: 200000, source: 'default' }
     */
    expect(getModelContextWindow(cfg({ provider: 'anthropic', anthropicMainModel: 'some-future-model' })))
      .toEqual({ tokens: 200_000, source: 'default' })
  })

  it('reads the loaded window for a local model when reported', () => {
    /**
     * LM Studio reports the loaded context length at runtime — the source of
     * truth for local mode, so small-context warnings are accurate.
     * Input: local + a model whose loadedContextLength is 4096
     * Expected output: { tokens: 4096, source: 'detected' }
     */
    expect(
      getModelContextWindow(
        cfg({ provider: 'local', localModel: 'm' }),
        [{ id: 'm', loadedContextLength: 4096, maxContextLength: 8192 }],
      ),
    ).toEqual({ tokens: 4096, source: 'detected' })
  })

  it('falls back to the conservative local default when no window is reported', () => {
    /**
     * Non-LM-Studio runtimes (Ollama, llama.cpp) don't report a window. Rather
     * than guess high and overflow, we fall back to a conservative 8,192.
     * Input: local with no matching model details
     * Expected output: { tokens: 8192, source: 'default' }
     */
    expect(getModelContextWindow(cfg({ provider: 'local', localModel: 'm' }), []))
      .toEqual({ tokens: 8_192, source: 'default' })
  })

  it('lets a manual override win over detection', () => {
    /**
     * If detection is missing or wrong, the user's manual window is authoritative
     * so the bar stays honest.
     * Input: a known anthropic model + override of 32,000
     * Expected output: { tokens: 32000, source: 'manual' }
     */
    expect(getModelContextWindow(cfg({ provider: 'anthropic', anthropicMainModel: 'claude-sonnet-4-5-20250514' }), undefined, 32_000))
      .toEqual({ tokens: 32_000, source: 'manual' })
  })

  it('prefers the LiteLLM catalog window over the static map for hosted models', () => {
    /**
     * Once the LiteLLM dataset has resolved the active model's real window, it
     * takes precedence over the hand-maintained static map — that's the whole
     * point of fetching it. Here the model is also in the static map (200k) but
     * the catalog says 1M, and the catalog must win.
     * Input: anthropic model in the static map + catalogWindow of 1,000,000
     * Expected output: { tokens: 1000000, source: 'detected' }
     */
    expect(getModelContextWindow(
      cfg({ provider: 'anthropic', anthropicMainModel: 'claude-sonnet-4-5-20250514' }),
      undefined,
      null,
      1_000_000,
    )).toEqual({ tokens: 1_000_000, source: 'detected' })
  })

  it('falls back to the static map when the catalog has no window yet (offline / pre-fetch)', () => {
    /**
     * Before the dataset loads (or when offline) catalogWindow is undefined and
     * the bar must still show a sensible number from the built-in map.
     * Input: a mapped OpenAI model + catalogWindow undefined
     * Expected output: { tokens: 128000, source: 'detected' } (from the map)
     */
    expect(getModelContextWindow(cfg({ provider: 'openai', openaiModel: 'gpt-4o' }), undefined, null, undefined))
      .toEqual({ tokens: 128_000, source: 'detected' })
  })

  it('ignores the catalog window for local mode (native ping is authoritative)', () => {
    /**
     * Local (LM Studio) reports the actually-loaded window, which can be smaller
     * than the model's theoretical max. A catalog value must never override it.
     * Input: local model with loadedContextLength 4096 + a catalogWindow of 1M
     * Expected output: { tokens: 4096, source: 'detected' } (the loaded window)
     */
    expect(getModelContextWindow(
      cfg({ provider: 'local', localModel: 'm' }),
      [{ id: 'm', loadedContextLength: 4096, maxContextLength: 8192 }],
      null,
      1_000_000,
    )).toEqual({ tokens: 4096, source: 'detected' })
  })
})
