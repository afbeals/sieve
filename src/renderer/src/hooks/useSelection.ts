import { useCallback, useMemo, useRef, useState } from 'react'
import type { FileRow } from '../../../shared/types'

export interface UseSelectionResult {
  selectedRows: FileRow[]
  setSelectedRows: React.Dispatch<React.SetStateAction<FileRow[]>>
  handleSelectRow: (row: FileRow, event: React.MouseEvent) => void
  selectionAggregate: { count: number; totalSizeBytes: number } | null
}

// `onActivateRow` is captured via a ref rather than a dependency: App.tsx defines
// handleRowActivate (folder navigation / file open) after this hook is called, since it needs
// listing/gallery state this hook doesn't own - a ref sidesteps that ordering entirely.
export function useSelection(onActivateRow: (row: FileRow) => void): UseSelectionResult {
  const [selectedRows, setSelectedRows] = useState<FileRow[]>([])
  const onActivateRef = useRef(onActivateRow)
  onActivateRef.current = onActivateRow

  // Manual double-click detection (click timestamps) instead of the native `dblclick` event:
  // every row is `draggable` for drag-to-move, and Chromium's drag-vs-click disambiguation on
  // the second mousedown of a fast double-click can swallow the synthetic `dblclick` entirely -
  // the right-click "Open" menu item (same onActivateRow call) worked, but `onDoubleClick` on
  // the row never fired at all.
  const lastRowClickRef = useRef<{ path: string; time: number } | null>(null)

  const handleSelectRow = useCallback((row: FileRow, event: React.MouseEvent): void => {
    const now = Date.now()
    const last = lastRowClickRef.current
    lastRowClickRef.current = { path: row.path, time: now }
    if (last && last.path === row.path && now - last.time < 400) {
      lastRowClickRef.current = null
      onActivateRef.current(row)
      return
    }
    const toggle = event.metaKey || event.ctrlKey
    setSelectedRows((prev) => {
      if (!toggle) return [row]
      const alreadySelected = prev.some((r) => r.path === row.path)
      return alreadySelected ? prev.filter((r) => r.path !== row.path) : [...prev, row]
    })
  }, [])

  const selectionAggregate = useMemo((): { count: number; totalSizeBytes: number } | null => {
    if (selectedRows.length <= 1) return null
    const totalSizeBytes = selectedRows.reduce((sum, row) => (row.isDirectory ? sum : sum + row.size), 0)
    return { count: selectedRows.length, totalSizeBytes }
  }, [selectedRows])

  return { selectedRows, setSelectedRows, handleSelectRow, selectionAggregate }
}
