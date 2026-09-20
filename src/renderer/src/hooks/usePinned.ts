import { useCallback, useState } from 'react'
import type { FileRow } from '../../../shared/types'

export interface UsePinnedResult {
  pinnedRows: Map<string, FileRow>
  pinnedPanelOpen: boolean
  setPinnedPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  allSelectedPinned: boolean
  handleTogglePinSelected: () => void
  handleUnpin: (path: string) => void
  handleSelectPinned: () => void
  handleClearPinned: () => void
  removePinnedPaths: (paths: string[]) => void
}

// Pinned "working set" (#26): survives filter/grouping/view-mode changes on purpose, so a
// multi-pass triage (filter -> pin a few -> change filter -> pin a few more -> ...) can end
// with one "Select All Pinned" that loads the whole set into selectedRows for a single bulk
// action. Stores the FileRow snapshot, not just the path, since a pinned file may be filtered
// out of `rows` entirely by the time it's acted on.
export function usePinned(
  selectedRows: FileRow[],
  onSelectPinned: (rows: FileRow[]) => void,
  closeContextMenu: () => void
): UsePinnedResult {
  const [pinnedRows, setPinnedRows] = useState<Map<string, FileRow>>(new Map())
  const [pinnedPanelOpen, setPinnedPanelOpen] = useState(false)

  const allSelectedPinned = selectedRows.length > 0 && selectedRows.every((row) => pinnedRows.has(row.path))

  const handleTogglePinSelected = useCallback((): void => {
    closeContextMenu()
    setPinnedRows((prev) => {
      const next = new Map(prev)
      for (const row of selectedRows) {
        if (allSelectedPinned) next.delete(row.path)
        else next.set(row.path, row)
      }
      return next
    })
  }, [selectedRows, allSelectedPinned, closeContextMenu])

  const handleUnpin = useCallback((path: string): void => {
    setPinnedRows((prev) => {
      const next = new Map(prev)
      next.delete(path)
      return next
    })
  }, [])

  const handleSelectPinned = useCallback((): void => {
    onSelectPinned(Array.from(pinnedRows.values()))
    setPinnedPanelOpen(false)
  }, [pinnedRows, onSelectPinned])

  const handleClearPinned = useCallback((): void => {
    setPinnedRows(new Map())
  }, [])

  // Deleted files can no longer be selected via "Select All Pinned" - drop them from the
  // pinned set instead of leaving stale entries a future action would silently no-op on.
  const removePinnedPaths = useCallback((paths: string[]): void => {
    setPinnedRows((prev) => {
      if (prev.size === 0) return prev
      const next = new Map(prev)
      for (const path of paths) next.delete(path)
      return next
    })
  }, [])

  return {
    pinnedRows,
    pinnedPanelOpen,
    setPinnedPanelOpen,
    allSelectedPinned,
    handleTogglePinSelected,
    handleUnpin,
    handleSelectPinned,
    handleClearPinned,
    removePinnedPaths
  }
}
