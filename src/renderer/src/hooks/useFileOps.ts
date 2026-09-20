import { useCallback, useEffect, useState } from 'react'
import type { FileRow } from '../../../shared/types'
import { basenameFallback, dirnameFallback } from '../pathUtils'
import type { FileAction } from '../types'

export interface ConfirmDialogState {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
}

export interface UseFileOpsResult {
  renamingPath: string | null
  renameDraft: string
  setRenameDraft: (draft: string) => void
  bulkRenameOpen: boolean
  bulkRenameDraft: string
  setBulkRenameDraft: (draft: string) => void
  fileOpError: string | null
  setFileOpError: (message: string | null) => void
  confirmDialog: ConfirmDialogState | null
  setConfirmDialog: (dialog: ConfirmDialogState | null) => void
  dragOverPath: string | null
  undoStack: FileAction[]
  redoStack: FileAction[]
  trashCount: number
  refreshTrashCount: (root: string) => Promise<void>
  fileClipboard: { paths: string[]; mode: 'copy' | 'cut' } | null
  handleStartRename: (row: FileRow) => void
  handleCancelRename: () => void
  handleCommitRename: () => Promise<void>
  handleStartBulkRename: () => void
  handleCancelBulkRename: () => void
  handleCommitBulkRename: () => Promise<void>
  handleNewFolder: () => Promise<void>
  handleCut: () => void
  handleCopy: () => void
  handlePaste: (destDir: string) => Promise<void>
  handleDuplicate: () => Promise<void>
  handleCopyPath: () => Promise<void>
  handleRevealInFolder: (row: FileRow) => Promise<void>
  handleDragStartRow: (event: React.DragEvent, row: FileRow) => void
  handleDragOverRow: (event: React.DragEvent, row: FileRow) => void
  handleDragLeaveRow: () => void
  handleDropOnRow: (event: React.DragEvent, row: FileRow) => Promise<void>
  handleDelete: (rowsOverride?: FileRow[]) => Promise<void>
  handleDeleteClick: (rowsOverride?: FileRow[]) => void
  handleEmptyTrash: () => Promise<void>
  handleEmptyTrashClick: () => void
  handleUndo: () => Promise<void>
  handleRedo: () => Promise<void>
  clearActionHistory: () => void
}

// File operations only perform the raw fs mutation via IPC; they never touch `rows`/DB state
// directly. The already-running filesystem watcher (main/index.ts) sees the same add/unlink
// events it would for an external change and updates the index, which flows back via the
// existing `watch:changed` -> reload() pipeline. The `reload()` calls below are just an
// optimistic nudge for snappier feedback; they are not the source of truth.
export function useFileOps(
  rootPath: string | null,
  currentDir: string | null,
  selectedRows: FileRow[],
  setSelectedRows: (rows: FileRow[]) => void,
  reload: () => void,
  removePinnedPaths: (paths: string[]) => void,
  closeContextMenu: () => void
): UseFileOpsResult {
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [bulkRenameOpen, setBulkRenameOpen] = useState(false)
  const [bulkRenameDraft, setBulkRenameDraft] = useState('')
  const [fileOpError, setFileOpError] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [undoStack, setUndoStack] = useState<FileAction[]>([])
  const [redoStack, setRedoStack] = useState<FileAction[]>([])
  const [trashCount, setTrashCount] = useState(0)
  const [fileClipboard, setFileClipboard] = useState<{ paths: string[]; mode: 'copy' | 'cut' } | null>(null)

  const refreshTrashCount = useCallback(async (root: string): Promise<void> => {
    setTrashCount(await window.api.getTrashCount(root))
  }, [])

  const handleStartRename = useCallback(
    (row: FileRow): void => {
      closeContextMenu()
      setRenamingPath(row.path)
      setRenameDraft(row.name)
    },
    [closeContextMenu]
  )

  const handleCancelRename = useCallback((): void => {
    setRenamingPath(null)
  }, [])

  const pushAction = useCallback((action: FileAction): void => {
    setUndoStack((prev) => [...prev, action])
    setRedoStack([])
  }, [])

  const handleCommitRename = useCallback(async (): Promise<void> => {
    const path = renamingPath
    const draft = renameDraft.trim()
    setRenamingPath(null)
    if (!path || !draft) return
    try {
      const newPath = await window.api.renamePath(path, draft)
      if (newPath !== path) pushAction({ type: 'rename', oldPath: path, newPath })
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Rename failed')
    }
  }, [renamingPath, renameDraft, pushAction, reload])

  const handleStartBulkRename = useCallback((): void => {
    closeContextMenu()
    if (selectedRows.length < 2) return
    const first = selectedRows[0]
    const base = first.isDirectory || !first.ext ? first.name : first.name.slice(0, first.name.length - first.ext.length - 1)
    setBulkRenameDraft(base)
    setBulkRenameOpen(true)
  }, [closeContextMenu, selectedRows])

  const handleCancelBulkRename = useCallback((): void => {
    setBulkRenameOpen(false)
  }, [])

  const handleCommitBulkRename = useCallback(async (): Promise<void> => {
    const draft = bulkRenameDraft.trim()
    const paths = selectedRows.map((row) => row.path)
    setBulkRenameOpen(false)
    if (!draft || paths.length === 0) return
    try {
      const renames = await window.api.bulkRename(paths, draft)
      pushAction({ type: 'bulkRename', renames })
      setSelectedRows([])
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Bulk rename failed')
    }
  }, [bulkRenameDraft, selectedRows, pushAction, setSelectedRows, reload])

  const handleNewFolder = useCallback(async (): Promise<void> => {
    closeContextMenu()
    if (!currentDir) return
    try {
      const path = await window.api.newFolder(currentDir)
      pushAction({ type: 'newFolder', path })
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Could not create folder')
    }
  }, [closeContextMenu, currentDir, pushAction, reload])

  const handleCut = useCallback((): void => {
    closeContextMenu()
    if (selectedRows.length === 0) return
    setFileClipboard({ paths: selectedRows.map((row) => row.path), mode: 'cut' })
  }, [closeContextMenu, selectedRows])

  const handleCopy = useCallback((): void => {
    closeContextMenu()
    if (selectedRows.length === 0) return
    setFileClipboard({ paths: selectedRows.map((row) => row.path), mode: 'copy' })
  }, [closeContextMenu, selectedRows])

  const handlePaste = useCallback(
    async (destDir: string): Promise<void> => {
      closeContextMenu()
      if (!fileClipboard) return
      try {
        if (fileClipboard.mode === 'cut') {
          const moves = await window.api.movePaths(fileClipboard.paths, destDir)
          if (moves.length > 0) pushAction({ type: 'move', moves })
          setFileClipboard(null)
        } else {
          const created = await window.api.copyPaths(fileClipboard.paths, destDir)
          if (created.length > 0) pushAction({ type: 'copy', created })
        }
        reload()
      } catch (err) {
        setFileOpError(err instanceof Error ? err.message : 'Paste failed')
      }
    },
    [closeContextMenu, fileClipboard, pushAction, reload]
  )

  const handleDuplicate = useCallback(async (): Promise<void> => {
    closeContextMenu()
    if (selectedRows.length === 0) return
    try {
      const created = await window.api.duplicatePaths(selectedRows.map((row) => row.path))
      if (created.length > 0) pushAction({ type: 'duplicate', created })
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Duplicate failed')
    }
  }, [closeContextMenu, selectedRows, pushAction, reload])

  const handleCopyPath = useCallback(async (): Promise<void> => {
    closeContextMenu()
    if (selectedRows.length === 0) return
    await window.api.copyPathsToClipboard(selectedRows.map((row) => row.path))
  }, [closeContextMenu, selectedRows])

  const handleRevealInFolder = useCallback(
    async (row: FileRow): Promise<void> => {
      closeContextMenu()
      await window.api.revealInFolder(row.path)
    },
    [closeContextMenu]
  )

  const handleDragStartRow = useCallback(
    (event: React.DragEvent, row: FileRow): void => {
      const paths = selectedRows.some((r) => r.path === row.path) ? selectedRows.map((r) => r.path) : [row.path]
      event.dataTransfer.setData('application/x-sieve-paths', JSON.stringify(paths))
      event.dataTransfer.effectAllowed = 'copyMove'
    },
    [selectedRows]
  )

  const handleDragOverRow = useCallback(
    (event: React.DragEvent, row: FileRow): void => {
      if (!row.isDirectory || !event.dataTransfer.types.includes('application/x-sieve-paths')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move'
      if (dragOverPath !== row.path) setDragOverPath(row.path)
    },
    [dragOverPath]
  )

  const handleDragLeaveRow = useCallback((): void => {
    setDragOverPath(null)
  }, [])

  const handleDropOnRow = useCallback(
    async (event: React.DragEvent, row: FileRow): Promise<void> => {
      if (!row.isDirectory) return
      event.preventDefault()
      setDragOverPath(null)
      const raw = event.dataTransfer.getData('application/x-sieve-paths')
      if (!raw) return
      const paths: string[] = JSON.parse(raw)
      const filtered = paths.filter((path) => path !== row.path)
      if (filtered.length === 0) return
      try {
        if (event.altKey) {
          const created = await window.api.copyPaths(filtered, row.path)
          if (created.length > 0) pushAction({ type: 'copy', created })
        } else {
          const moves = await window.api.movePaths(filtered, row.path)
          if (moves.length > 0) pushAction({ type: 'move', moves })
        }
        reload()
      } catch (err) {
        setFileOpError(err instanceof Error ? err.message : 'Drop failed')
      }
    },
    [pushAction, reload]
  )

  const handleDelete = useCallback(
    async (rowsOverride?: FileRow[]): Promise<void> => {
      closeContextMenu()
      const targetRows = rowsOverride ?? selectedRows
      if (!rootPath || targetRows.length === 0) return
      try {
        const deletions = await window.api.deletePaths(rootPath, targetRows.map((row) => row.path))
        if (deletions.length > 0) {
          pushAction({ type: 'delete', deletions })
          removePinnedPaths(deletions.map(({ oldPath }) => oldPath))
        }
        setSelectedRows([])
        reload()
        void refreshTrashCount(rootPath)
      } catch (err) {
        setFileOpError(err instanceof Error ? err.message : 'Delete failed')
      }
    },
    [closeContextMenu, selectedRows, rootPath, pushAction, removePinnedPaths, setSelectedRows, reload, refreshTrashCount]
  )

  // Confirmation gate for destructive actions only (delete-to-trash, permanent empty-trash) -
  // deliberately not applied to rename/move/etc, which are either trivially reversible or not
  // destructive in the same sense.
  const handleDeleteClick = useCallback(
    (rowsOverride?: FileRow[]): void => {
      closeContextMenu()
      const targetRows = rowsOverride ?? selectedRows
      if (targetRows.length === 0) return
      setConfirmDialog({
        title: 'Delete files',
        message: `Move ${targetRows.length} item${targetRows.length === 1 ? '' : 's'} to trash? This can be undone.`,
        confirmLabel: 'Delete',
        onConfirm: () => void handleDelete(rowsOverride)
      })
    },
    [closeContextMenu, selectedRows, handleDelete]
  )

  const handleEmptyTrash = useCallback(async (): Promise<void> => {
    if (!rootPath || trashCount === 0) return
    try {
      await window.api.emptyTrash(rootPath)
      // Any pending undo/redo "delete" entries would now restore from paths that no longer
      // exist - clearing both stacks avoids a confusing "Undo failed" the next time either is
      // used, at the cost of also losing history for unrelated earlier actions.
      setUndoStack([])
      setRedoStack([])
      void refreshTrashCount(rootPath)
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Empty Trash failed')
    }
  }, [rootPath, trashCount, refreshTrashCount])

  const handleEmptyTrashClick = useCallback((): void => {
    if (!rootPath || trashCount === 0) return
    setConfirmDialog({
      title: 'Empty trash',
      message: `Permanently delete ${trashCount} item${trashCount === 1 ? '' : 's'} in the trash? This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      onConfirm: () => void handleEmptyTrash()
    })
  }, [rootPath, trashCount, handleEmptyTrash])

  const applyInverseAction = useCallback(
    async (action: FileAction): Promise<void> => {
      switch (action.type) {
        case 'newFolder':
          await window.api.removePaths([action.path])
          break
        case 'rename':
          await window.api.renamePath(action.newPath, basenameFallback(action.oldPath))
          break
        case 'bulkRename':
          for (const { oldPath, newPath } of action.renames) {
            await window.api.renamePath(newPath, basenameFallback(oldPath))
          }
          break
        case 'move':
          for (const { oldPath, newPath } of action.moves) {
            await window.api.movePaths([newPath], dirnameFallback(oldPath))
          }
          break
        case 'copy':
        case 'duplicate':
          await window.api.removePaths(action.created.map((entry) => entry.newPath))
          break
        case 'delete':
          for (const { oldPath, newPath } of action.deletions) {
            await window.api.movePaths([newPath], dirnameFallback(oldPath))
          }
          if (rootPath) void refreshTrashCount(rootPath)
          break
      }
    },
    [rootPath, refreshTrashCount]
  )

  const applyForwardAction = useCallback(
    async (action: FileAction): Promise<void> => {
      switch (action.type) {
        case 'newFolder':
          await window.api.newFolder(dirnameFallback(action.path))
          break
        case 'rename':
          await window.api.renamePath(action.oldPath, basenameFallback(action.newPath))
          break
        case 'bulkRename':
          for (const { oldPath, newPath } of action.renames) {
            await window.api.renamePath(oldPath, basenameFallback(newPath))
          }
          break
        case 'move':
          for (const { oldPath, newPath } of action.moves) {
            await window.api.movePaths([oldPath], dirnameFallback(newPath))
          }
          break
        case 'copy':
          await window.api.copyPaths(
            action.created.map((entry) => entry.oldPath),
            dirnameFallback(action.created[0].newPath)
          )
          break
        case 'duplicate':
          await window.api.duplicatePaths(action.created.map((entry) => entry.oldPath))
          break
        case 'delete':
          if (rootPath) {
            await window.api.deletePaths(
              rootPath,
              action.deletions.map((entry) => entry.oldPath)
            )
            void refreshTrashCount(rootPath)
          }
          break
      }
    },
    [rootPath, refreshTrashCount]
  )

  const handleUndo = useCallback(async (): Promise<void> => {
    const action = undoStack[undoStack.length - 1]
    if (!action) return
    setUndoStack((prev) => prev.slice(0, -1))
    try {
      await applyInverseAction(action)
      setRedoStack((prev) => [...prev, action])
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Undo failed')
    }
  }, [undoStack, applyInverseAction, reload])

  // Exposed for a fresh root pick, which should start with a clean slate - an undo/redo entry
  // from the previous root's session would reference paths that no longer apply.
  const clearActionHistory = useCallback((): void => {
    setUndoStack([])
    setRedoStack([])
  }, [])

  const handleRedo = useCallback(async (): Promise<void> => {
    const action = redoStack[redoStack.length - 1]
    if (!action) return
    setRedoStack((prev) => prev.slice(0, -1))
    try {
      await applyForwardAction(action)
      setUndoStack((prev) => [...prev, action])
      reload()
    } catch (err) {
      setFileOpError(err instanceof Error ? err.message : 'Redo failed')
    }
  }, [redoStack, applyForwardAction, reload])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      event.preventDefault()
      if (event.shiftKey) void handleRedo()
      else void handleUndo()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  return {
    renamingPath,
    renameDraft,
    setRenameDraft,
    bulkRenameOpen,
    bulkRenameDraft,
    setBulkRenameDraft,
    fileOpError,
    setFileOpError,
    confirmDialog,
    setConfirmDialog,
    dragOverPath,
    undoStack,
    redoStack,
    trashCount,
    refreshTrashCount,
    fileClipboard,
    handleStartRename,
    handleCancelRename,
    handleCommitRename,
    handleStartBulkRename,
    handleCancelBulkRename,
    handleCommitBulkRename,
    handleNewFolder,
    handleCut,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleCopyPath,
    handleRevealInFolder,
    handleDragStartRow,
    handleDragOverRow,
    handleDragLeaveRow,
    handleDropOnRow,
    handleDelete,
    handleDeleteClick,
    handleEmptyTrash,
    handleEmptyTrashClick,
    handleUndo,
    handleRedo,
    clearActionHistory
  }
}
