/**
 * @vitest-environment jsdom
 */
// Naigen Desk: with the Genspark gate off the settings screen shows no Genspark
// sign-in, credits, cloud tools switch or provider entry. The upstream suite runs
// with the gate on (setupFiles), so this file re-mocks it to false.
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAiSettings } from '@genoffice/ai-provider'
import type { HomeApi } from '../src/shared/home-api'

const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  vi.resetModules()
  vi.doMock('../../../packages/ai-provider/src/genspark-gate', () => ({ GENSPARK_ENABLED: false }))
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.doUnmock('../../../packages/ai-provider/src/genspark-gate')
})

function installApi(): void {
  const settings = defaultAiSettings()
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    setAnalyticsEnabled: async () => true,
    getAiPanelPrefs: async () => ({ fontSize: 'medium', customFontSize: 14, spellcheck: true }),
    setAiPanelPrefs: async (patch: unknown) => patch,
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    githubStars: async () => 1234,
    getAiProviders: () => [
      {
        id: 'genspark',
        label: 'Genspark',
        models: [],
        defaultModel: '',
        keyPlaceholder: 'k',
        defaultBaseUrl: '',
      },
      {
        id: 'anthropic',
        label: 'Anthropic',
        models: ['m'],
        defaultModel: 'm',
        keyPlaceholder: 'API Key',
        defaultBaseUrl: '',
      },
    ],
    getAiSettings: async () => settings,
    setAiSettings: async () => undefined,
  } as unknown as HomeApi
}

async function open(): Promise<void> {
  installApi()
  const { LocaleProvider } = await import('../src/renderer/src/locale')
  const { SettingsModal } = await import('../src/renderer/src/SettingsModal')
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(SettingsModal, {
          status: null,
          loggingOut: false,
          loginWaiting: false,
          loginUrl: null,
          urlCopied: false,
          onOpenLoginUrl: vi.fn(),
          onCopyLoginUrl: vi.fn(),
          onClose: vi.fn(),
          onLogin: vi.fn(),
          onLogout: vi.fn(),
        }),
      ),
    )
    await Promise.resolve()
  })
}

async function click(button: HTMLElement): Promise<void> {
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

describe('settings with the Genspark gate off', () => {
  it('opens on General, with no Account section and no sign-in text', async () => {
    await open()
    const labels = Array.from(host.querySelectorAll('.set-nav-item')).map((n) => n.textContent)
    expect(labels).not.toContain('Account')
    expect(host.querySelector('.set-pane')?.getAttribute('data-section')).toBe('general')
    expect(host.textContent).not.toContain('Sign in with Genspark')
    expect(host.textContent).not.toContain('Not signed in')
  })

  it('hides the Genspark provider and the cloud tools switch in the AI Model pane', async () => {
    await open()
    const nav = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find((b) =>
      b.textContent?.includes('AI Model'),
    )
    await click(nav!)
    const trigger = host.querySelector<HTMLButtonElement>('.gs-dd-btn[aria-label="Provider"]')!
    await click(trigger)
    const options = Array.from(host.querySelectorAll('.gs-dd-pop [role="option"]')).map(
      (o) => o.getAttribute('aria-label') ?? o.textContent,
    )
    expect(options).toContain('Anthropic')
    expect(options).not.toContain('Genspark')
    expect(host.querySelector('[aria-label="Genspark cloud tools"]')).toBeNull()
  })

  it('keeps the upstream repository link and star count out of About', async () => {
    await open()
    const nav = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find((b) =>
      b.textContent?.includes('About'),
    )
    await click(nav!)
    expect(host.textContent).not.toContain('genspark-ai/genoffice')
  })
})
