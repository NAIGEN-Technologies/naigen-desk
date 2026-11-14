// Naigen Desk: with the Genspark gate off, no login, key lookup or gsk call may reach the network.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.fn()

async function loadGated() {
  vi.resetModules()
  vi.doMock('../../ai-provider/src/genspark-gate', () => ({ GENSPARK_ENABLED: false }))
  vi.doMock('node:child_process', () => ({ execFile: execFileMock }))
  const auth = await import('../src/genoffice-auth')
  const gsk = await import('../src/gsk')
  return { auth, gsk }
}

describe('Genspark gate off', () => {
  let dir: string
  const fetchMock = vi.fn()
  const envBefore = { dir: process.env.GENOFFICE_AUTH_DIR, key: process.env.GSK_API_KEY }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'genspark-gate-'))
    process.env.GENOFFICE_AUTH_DIR = dir
    process.env.GSK_API_KEY = 'env-key-must-be-ignored'
    writeFileSync(join(dir, 'auth.json'), JSON.stringify({ api_key: 'stored-key' }))
    fetchMock.mockReset()
    execFileMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.doUnmock('../../ai-provider/src/genspark-gate')
    vi.doUnmock('node:child_process')
    rmSync(dir, { recursive: true, force: true })
    for (const [k, v] of [
      ['GENOFFICE_AUTH_DIR', envBefore.dir],
      ['GSK_API_KEY', envBefore.key],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('does not start a device-code login', async () => {
    const { auth } = await loadGated()
    const opened: string[] = []
    expect(auth.startGenofficeLogin()).toBe(false)
    auth.ensureGenofficeLogin((url) => opened.push(url))
    expect(auth.genofficeLoginInFlight()).toBe(false)
    expect(opened).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a rejected key neither re-mints nor logs in', async () => {
    const { auth } = await loadGated()
    const opened: string[] = []
    auth.setGenofficeLoginOpener((url) => opened.push(url))
    await expect(auth.recoverFromRejectedGskKey('stored-key')).resolves.toBe('login_required')
    expect(opened).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores a stored key and GSK_API_KEY, so no gsk call is signed in', async () => {
    const { auth, gsk } = await loadGated()
    expect(auth.loadGenofficeAuth()).toBeNull()
    expect(gsk.gskApiKey()).toBe('')
    expect(gsk.hasGskAuth()).toBe(false)
  })

  it('refuses to spawn the gsk CLI or call Genspark', async () => {
    const { gsk } = await loadGated()
    await expect(gsk.gskWebSearch('anything')).rejects.toThrow(/not available/)
    await expect(gsk.gskLoginInfo()).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
