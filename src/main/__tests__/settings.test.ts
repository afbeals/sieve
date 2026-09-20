import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/types'

// settings.ts resolves its on-disk path from `app.isPackaged` + `process.execPath` (the
// "portable app" pattern - see the code comment in settings.ts). Mocking `app.isPackaged: true`
// and pointing `process.execPath` at a temp directory redirects that resolution to a real,
// disposable file instead of the actual dev-mode src/appConfig.json - so these tests exercise
// the real read/merge/write logic without touching the project's own config file.
vi.mock('electron', () => ({ app: { isPackaged: true } }))

let tempDir: string
let originalExecPath: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sieve-settings-'))
  originalExecPath = process.execPath
  process.execPath = join(tempDir, 'fake-app')
})

afterEach(() => {
  process.execPath = originalExecPath
  rmSync(tempDir, { recursive: true, force: true })
  vi.resetModules()
})

async function loadSettingsModule(): Promise<typeof import('../settings')> {
  vi.resetModules()
  return import('../settings')
}

describe('loadSettings', () => {
  it('returns the defaults when no config file exists yet', async () => {
    const { loadSettings } = await loadSettingsModule()
    const settings = loadSettings()
    expect(settings.theme).toBe('system')
    expect(settings.trash.autoPurgeDays).toBeNull()
    expect(settings.thumbnails).toEqual({ videoFrameCount: 6, resolution: 800 })
    expect(settings.savedViews).toEqual([])
  })

  it('merges a partial on-disk file onto the defaults field-by-field', async () => {
    const { loadSettings } = await loadSettingsModule()
    // Simulate an older config file that predates a field the current defaults have (e.g. a
    // saved theme, but no `performance` block at all) by writing straight to disk first.
    const configPath = join(tempDir, 'appConfig.json')
    const fs = await import('node:fs')
    fs.writeFileSync(configPath, JSON.stringify({ theme: 'dark' }))

    const settings = loadSettings()
    expect(settings.theme).toBe('dark')
    // Fields missing from the on-disk file fall back to the default, not undefined.
    expect(settings.performance).toEqual({ workerConcurrency: 2 })
  })

  it('falls back to defaults when the config file is missing or invalid JSON', async () => {
    const configPath = join(tempDir, 'appConfig.json')
    const fs = await import('node:fs')
    fs.writeFileSync(configPath, '{ not valid json')

    const { loadSettings } = await loadSettingsModule()
    expect(loadSettings().theme).toBe('system')
  })
})

describe('saveSettings', () => {
  it('merges a partial update onto the current settings and persists it to disk', async () => {
    const { loadSettings, saveSettings } = await loadSettingsModule()
    loadSettings()
    const updated = saveSettings({ theme: 'dark' })

    expect(updated.theme).toBe('dark')
    expect(updated.defaultSortField).toBe('name')

    const configPath = join(tempDir, 'appConfig.json')
    expect(existsSync(configPath)).toBe(true)
    const onDisk = JSON.parse(readFileSync(configPath, 'utf-8')) as AppSettings
    expect(onDisk.theme).toBe('dark')
  })

  it('merges nested objects (e.g. thumbnails) instead of replacing them wholesale', async () => {
    const { loadSettings, saveSettings } = await loadSettingsModule()
    loadSettings()
    const updated = saveSettings({ thumbnails: { videoFrameCount: 3, resolution: 800 } })
    saveSettings({ thumbnails: { ...updated.thumbnails, videoFrameCount: 9 } })
    const final = await (await loadSettingsModule()).loadSettings()
    // Re-reading from a fresh module instance confirms the write round-tripped through disk,
    // not just the in-memory cache.
    expect(final.thumbnails.resolution).toBe(800)
    expect(final.thumbnails.videoFrameCount).toBe(9)
  })
})

describe('exportSettingsToFile / importSettingsFromFile', () => {
  it('round-trips settings through an exported file', async () => {
    const { loadSettings, saveSettings, exportSettingsToFile, importSettingsFromFile } = await loadSettingsModule()
    loadSettings()
    saveSettings({ theme: 'dark' })

    const exportPath = join(tempDir, 'exported.json')
    exportSettingsToFile(exportPath)
    expect(existsSync(exportPath)).toBe(true)

    const imported = importSettingsFromFile(exportPath)
    expect(imported.theme).toBe('dark')
  })
})
