// Naigen Desk: with the Genspark gate off, defaults never select Genspark and no proxy URL is built.
import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadGated() {
  vi.resetModules()
  vi.doMock('../src/genspark-gate', () => ({ GENSPARK_ENABLED: false }))
  const providers = await import('../src/providers')
  const registry = await import('../src/registry')
  const guard = await import('../src/ai-settings-guard')
  return { providers, registry, guard }
}

describe('Genspark gate off', () => {
  afterEach(() => {
    vi.doUnmock('../src/genspark-gate')
  })

  it('defaults to a BYOK provider with no key and cloud tools off', async () => {
    const { providers } = await loadGated()
    const defaults = providers.defaultAiSettings()
    expect(defaults.provider).not.toBe('genspark')
    expect(defaults.gskToolsEnabled).toBe(false)
    expect(providers.cloudToolsEnabled({ gskToolsEnabled: true })).toBe(false)
    expect(providers.activeProvider(defaults)).toBe(defaults.provider)
    expect(defaults.providers[defaults.provider].apiKey).toBe('')
  })

  it('replaces a stored Genspark selection and never falls back to it', async () => {
    const { providers } = await loadGated()
    const resolved = providers.resolveAiSettings(
      { provider: 'genspark', providers: { genspark: { apiKey: '', model: 'x' } } },
      providers.defaultAiSettings(),
    )
    expect(resolved.provider).not.toBe('genspark')
    expect(providers.activeProvider({ ...resolved, provider: 'openai' })).not.toBe('genspark')
  })

  it('sanitizing a renderer payload that selects Genspark stores the fallback', async () => {
    const { providers, guard } = await loadGated()
    const payload = providers.defaultAiSettings()
    const sanitized = guard.sanitizeAiSettings({ ...payload, provider: 'genspark' })
    expect(sanitized?.provider).not.toBe('genspark')
  })

  it('builds no Genspark endpoint', async () => {
    const { registry } = await loadGated()
    expect(() =>
      registry.AI_PROVIDER_ADAPTERS.genspark.resolveEndpoint({
        apiKey: 'k',
        model: 'claude-opus-5-5',
      }),
    ).toThrow(/not available/)
  })
})
