import { useCallback, useEffect, useRef, useState } from 'react'
import { useMantineColorScheme } from '@mantine/core'
import type { AppSettings } from '../../../shared/types'

export interface UseSettingsResult {
  settings: AppSettings | null
  settingsDraft: AppSettings | null
  settingsPanelOpen: boolean
  settingsLoadedRef: React.RefObject<boolean>
  setSettingsDraft: (draft: AppSettings | null) => void
  setSettingsPanelOpen: (open: boolean) => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  handleOpenSettings: () => void
  handleCancelSettings: () => void
  handleSaveSettings: () => Promise<void>
  handleExportConfig: () => Promise<void>
  handleImportConfig: () => Promise<void>
}

// `onLoaded`/`onImportError` are captured via refs instead of the effect/callback dependency
// arrays: the caller (App) passes new inline closures every render, and these only ever need
// to see the latest version at call time, not to re-run when they change identity.
export function useSettings(onLoaded: (loaded: AppSettings) => void, onImportError: (message: string) => void): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<AppSettings | null>(null)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const settingsLoadedRef = useRef(false)
  const onLoadedRef = useRef(onLoaded)
  onLoadedRef.current = onLoaded
  const onImportErrorRef = useRef(onImportError)
  onImportErrorRef.current = onImportError

  // Settings apply as initial defaults for a fresh session (sort/view mode), not retroactively
  // to whatever the user has already changed mid-session - loaded once on mount. `onLoaded`
  // lets the caller apply those defaults to state this hook doesn't own (sort/view mode/column
  // widths), keeping this hook scoped to the settings blob itself.
  useEffect(() => {
    void (async () => {
      const loaded = await window.api.getSettings()
      setSettings(loaded)
      onLoadedRef.current(loaded)
      settingsLoadedRef.current = true
    })()
  }, [])

  // Theme toggle (#36): Mantine's own color-scheme system (wired up in main.tsx's
  // MantineProvider) now owns OS-preference tracking and, critically, sets the `color-scheme`
  // CSS property at the root - which is what makes native <button>/<input>/<select> elements
  // actually render with dark chrome instead of staying white ("white spots" the user found).
  // We just sync our persisted `settings.theme` ('system' maps to Mantine's 'auto') into it. Our
  // own custom-styled elements read Mantine's CSS variables directly (the module-level `theme`
  // object in constants.ts), so they switch with the color scheme automatically with no JS branch.
  const { setColorScheme } = useMantineColorScheme()
  useEffect(() => {
    if (!settings) return
    setColorScheme(settings.theme === 'system' ? 'auto' : settings.theme)
  }, [settings?.theme, setColorScheme])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const saved = await window.api.updateSettings(patch)
    setSettings(saved)
    return saved
  }, [])

  const handleOpenSettings = useCallback((): void => {
    if (settings) setSettingsDraft(settings)
    setSettingsPanelOpen(true)
  }, [settings])

  const handleCancelSettings = useCallback((): void => {
    setSettingsPanelOpen(false)
  }, [])

  const handleSaveSettings = useCallback(async (): Promise<void> => {
    if (!settingsDraft) return
    await updateSettings(settingsDraft)
    setSettingsPanelOpen(false)
  }, [settingsDraft, updateSettings])

  const handleExportConfig = useCallback(async (): Promise<void> => {
    await window.api.exportConfig()
  }, [])

  const handleImportConfig = useCallback(async (): Promise<void> => {
    try {
      const imported = await window.api.importConfig()
      if (imported) {
        setSettings(imported)
        setSettingsDraft(imported)
      }
    } catch (err) {
      onImportErrorRef.current(err instanceof Error ? err.message : 'Import failed')
    }
  }, [])

  return {
    settings,
    settingsDraft,
    settingsPanelOpen,
    settingsLoadedRef,
    setSettingsDraft,
    setSettingsPanelOpen,
    updateSettings,
    handleOpenSettings,
    handleCancelSettings,
    handleSaveSettings,
    handleExportConfig,
    handleImportConfig
  }
}
