import { useCallback, useEffect, useState } from 'react'
import type { FilterRule, ListingScope, QuickFilters, StorageBreakdownEntry } from '../../../shared/types'

export interface UseStorageBreakdownResult {
  storageBreakdown: StorageBreakdownEntry[]
  storagePanelOpen: boolean
  setStoragePanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  loadStorageBreakdown: () => Promise<void>
}

// Storage breakdown (#33): only fetched while its panel is open - it's a diagnostic view, not
// something the whole-view status bar (the listing aggregate) needs on every keystroke.
// `buildScope`/`currentDir` are taken as params (rather than this hook computing scope itself)
// so it stays reactive to the same identity/value changes the listing state already tracks,
// without duplicating that logic.
export function useStorageBreakdown(
  buildScope: (dir: string | null) => ListingScope | null,
  currentDir: string | null,
  filterRules: FilterRule[],
  quickFilters: QuickFilters
): UseStorageBreakdownResult {
  const [storageBreakdown, setStorageBreakdown] = useState<StorageBreakdownEntry[]>([])
  const [storagePanelOpen, setStoragePanelOpen] = useState(false)

  const loadStorageBreakdown = useCallback(async (): Promise<void> => {
    if (!storagePanelOpen) return
    const scope = buildScope(currentDir)
    if (!scope) {
      setStorageBreakdown([])
      return
    }
    try {
      const result = await window.api.getStorageBreakdown({ scope, filterRules, quickFilters })
      setStorageBreakdown(result)
    } catch (err) {
      console.error('Failed to load storage breakdown', err)
    }
  }, [storagePanelOpen, buildScope, currentDir, filterRules, quickFilters])

  useEffect(() => {
    void loadStorageBreakdown()
  }, [loadStorageBreakdown])

  return { storageBreakdown, storagePanelOpen, setStoragePanelOpen, loadStorageBreakdown }
}
