import { useCallback, useRef, useState } from 'react'
import type { AppSettings, SavedView } from '../../../shared/types'

export interface UseSavedViewsResult {
  savedViewsPanelOpen: boolean
  setSavedViewsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  saveViewDraftOpen: boolean
  saveViewNameDraft: string
  setSaveViewNameDraft: (name: string) => void
  handleOpenSaveView: () => void
  handleCancelSaveView: () => void
  handleCommitSaveView: () => Promise<void>
  handleLoadView: (view: SavedView) => void
  handleDeleteView: (id: string) => Promise<void>
}

// A named bundle of {filters, combinators, sort, grouping, view mode} (#13/step 20), persisted
// via `settings.savedViews`. `captureCurrentView`/`applyView` are supplied by the caller (App)
// since they read/write nine different pieces of state this hook doesn't own - captured via
// refs so they don't need to be stable across renders.
export function useSavedViews(
  settings: AppSettings | null,
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>,
  captureCurrentView: () => Omit<SavedView, 'id' | 'name' | 'createdAt'>,
  applyView: (view: SavedView) => void
): UseSavedViewsResult {
  const [savedViewsPanelOpen, setSavedViewsPanelOpen] = useState(false)
  const [saveViewDraftOpen, setSaveViewDraftOpen] = useState(false)
  const [saveViewNameDraft, setSaveViewNameDraft] = useState('')
  const captureRef = useRef(captureCurrentView)
  captureRef.current = captureCurrentView
  const applyRef = useRef(applyView)
  applyRef.current = applyView

  const handleOpenSaveView = useCallback((): void => {
    setSaveViewNameDraft('')
    setSaveViewDraftOpen(true)
    setSavedViewsPanelOpen(false)
  }, [])

  const handleCancelSaveView = useCallback((): void => {
    setSaveViewDraftOpen(false)
  }, [])

  const handleCommitSaveView = useCallback(async (): Promise<void> => {
    const name = saveViewNameDraft.trim()
    setSaveViewDraftOpen(false)
    if (!name || !settings) return
    const view: SavedView = {
      id: `${Date.now()}`,
      name,
      createdAt: Date.now(),
      ...captureRef.current()
    }
    await updateSettings({ savedViews: [...settings.savedViews, view] })
  }, [saveViewNameDraft, settings, updateSettings])

  const handleLoadView = useCallback((view: SavedView): void => {
    applyRef.current(view)
    setSavedViewsPanelOpen(false)
  }, [])

  const handleDeleteView = useCallback(
    async (id: string): Promise<void> => {
      if (!settings) return
      await updateSettings({ savedViews: settings.savedViews.filter((view) => view.id !== id) })
    },
    [settings, updateSettings]
  )

  return {
    savedViewsPanelOpen,
    setSavedViewsPanelOpen,
    saveViewDraftOpen,
    saveViewNameDraft,
    setSaveViewNameDraft,
    handleOpenSaveView,
    handleCancelSaveView,
    handleCommitSaveView,
    handleLoadView,
    handleDeleteView
  }
}
