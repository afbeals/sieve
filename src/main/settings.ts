import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppSettings } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  thumbnails: { videoFrameCount: 6, resolution: 800 },
  performance: { workerConcurrency: 2 },
  // Off/manual by default (per the plan's architecture notes) - never silently delete a
  // user's trashed files on a timer unless they opt in.
  trash: { autoPurgeDays: null },
  theme: 'system',
  defaultSortField: 'name',
  defaultSortDir: 'asc',
  defaultViewMode: 'table',
  columnWidths: null,
  savedViews: []
}

// "Portable app" pattern: config sits next to the application itself, not in the OS per-user
// app-data folder, so the whole thing (binary + config) can be copied/moved as one unit.
// - Packaged: next to the actual executable (dirname(process.execPath)) - e.g. right beside
//   Sieve.exe on Windows, which is exactly where a portable/unzipped build should keep its
//   config, and is writable without admin rights as long as the app itself was placed
//   somewhere the user can write to. On macOS this resolves to inside the .app bundle
//   (Contents/MacOS/) rather than next to the bundle itself - workable for a user's own
//   drag-installed app, but worth revisiting once Phase G actually packages for Mac.
// - Dev (not yet packaged): there's no executable to sit beside, so fall back to the
//   project's own source tree. __dirname here is the compiled out/main/ directory, so this
//   resolves to <project root>/src/appConfig.json regardless of the process's cwd.
function getSettingsPath(): string {
  if (app.isPackaged) return join(dirname(process.execPath), 'appConfig.json')
  return join(__dirname, '../../src/appConfig.json')
}

let cached: AppSettings | null = null

// Merges onto the defaults field-by-field (not a shallow spread of the whole object) so a
// settings.json written by an older version of the app - missing a field this version added -
// still gets a usable value instead of `undefined` for that field.
export function loadSettings(): AppSettings {
  if (cached) return cached
  try {
    const raw = JSON.parse(readFileSync(getSettingsPath(), 'utf-8')) as Partial<AppSettings>
    cached = {
      ...DEFAULT_SETTINGS,
      ...raw,
      thumbnails: { ...DEFAULT_SETTINGS.thumbnails, ...raw.thumbnails },
      performance: { ...DEFAULT_SETTINGS.performance, ...raw.performance },
      trash: { ...DEFAULT_SETTINGS.trash, ...raw.trash }
    }
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  return cached
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next: AppSettings = {
    ...current,
    ...partial,
    thumbnails: { ...current.thumbnails, ...partial.thumbnails },
    performance: { ...current.performance, ...partial.performance },
    trash: { ...current.trash, ...partial.trash }
  }
  cached = next
  writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2))
  return next
}

// Config export/import (#20/#37): exports the file at whatever path is currently active
// (project-relative in dev, portable-next-to-exe once packaged) to a user-chosen location, and
// imports one back in - reusing saveSettings' field-by-field merge so an imported file missing
// newer fields doesn't wipe them back to `undefined`. Regex pattern history is deliberately
// NOT part of this - it's SQLite-backed (db.ts, built in Phase B before this settings file
// existed) rather than settings.json-backed, so it isn't included in an export/import round
// trip; only the settings file's own fields (including savedViews) are.
export function exportSettingsToFile(filePath: string): void {
  writeFileSync(filePath, JSON.stringify(loadSettings(), null, 2))
}

export function importSettingsFromFile(filePath: string): AppSettings {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AppSettings>
  return saveSettings(raw)
}
