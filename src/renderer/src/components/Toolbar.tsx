import { Button, Checkbox, Group, SegmentedControl, Text } from '@mantine/core'
import { IconSettings } from '@tabler/icons-react'
import { theme } from '../constants'
import { describeFileAction, formatBytes } from '../pathUtils'
import type { FileRow, IndexHealth, SavedView, StorageBreakdownEntry } from '../../../shared/types'
import type { FileAction } from '../types'
import { PinnedPopover } from './PinnedPopover'
import { SavedViewsPopover } from './SavedViewsPopover'
import { StoragePopover } from './StoragePopover'

export interface ToolbarProps {
  rootPath: string | null
  currentDir: string | null
  scanning: boolean
  scanned: number
  total: number
  error: string | null
  health: IndexHealth | null
  viewMode: 'recursive' | 'folder'
  setViewMode: (mode: 'recursive' | 'folder') => void
  displayMode: 'table' | 'gallery'
  setDisplayMode: (mode: 'table' | 'gallery') => void
  fileClipboard: { paths: string[]; mode: 'copy' | 'cut' } | null
  undoStack: FileAction[]
  redoStack: FileAction[]
  selectedCount: number
  trashCount: number
  pinnedPanelOpen: boolean
  setPinnedPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  pinnedRows: Map<string, FileRow>
  savedViewsPanelOpen: boolean
  setSavedViewsPanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  savedViews: SavedView[] | null
  storagePanelOpen: boolean
  setStoragePanelOpen: React.Dispatch<React.SetStateAction<boolean>>
  storageBreakdown: StorageBreakdownEntry[]
  onPickRoot: () => void
  onRescan: () => void
  onCancelScan: () => void
  onNewFolder: () => void
  onPaste: (destDir: string) => void
  onUndo: () => void
  onRedo: () => void
  onDeleteClick: () => void
  onEmptyTrashClick: () => void
  onClearPinned: () => void
  onUnpin: (path: string) => void
  onSelectPinned: () => void
  onLoadView: (view: SavedView) => void
  onDeleteView: (id: string) => void
  onOpenSaveView: () => void
  onOpenSettings: () => void
}

export function Toolbar({
  rootPath,
  currentDir,
  scanning,
  scanned,
  total,
  error,
  health,
  viewMode,
  setViewMode,
  displayMode,
  setDisplayMode,
  fileClipboard,
  undoStack,
  redoStack,
  selectedCount,
  trashCount,
  pinnedPanelOpen,
  setPinnedPanelOpen,
  pinnedRows,
  savedViewsPanelOpen,
  setSavedViewsPanelOpen,
  savedViews,
  storagePanelOpen,
  setStoragePanelOpen,
  storageBreakdown,
  onPickRoot,
  onRescan,
  onCancelScan,
  onNewFolder,
  onPaste,
  onUndo,
  onRedo,
  onDeleteClick,
  onEmptyTrashClick,
  onClearPinned,
  onUnpin,
  onSelectPinned,
  onLoadView,
  onDeleteView,
  onOpenSaveView,
  onOpenSettings
}: ToolbarProps): React.JSX.Element {
  return (
    <Group gap="sm" wrap="wrap" style={{ padding: 12, borderBottom: `1px solid ${theme.border}` }}>
      <Button variant="default" size="sm" onClick={onPickRoot}>
        Choose folder…
      </Button>
      <Checkbox
        label="Show entire subtree"
        checked={viewMode === 'recursive'}
        onChange={(event) => setViewMode(event.currentTarget.checked ? 'recursive' : 'folder')}
      />
      <SegmentedControl
        size="sm"
        value={displayMode}
        onChange={(value) => setDisplayMode(value as 'table' | 'gallery')}
        data={[
          { label: 'Table', value: 'table' },
          { label: 'Gallery', value: 'gallery' }
        ]}
      />
      {rootPath && !scanning && (
        <Button variant="default" size="sm" onClick={onRescan}>
          Rescan
        </Button>
      )}
      {rootPath && currentDir && !scanning && (
        <Button variant="default" size="sm" onClick={onNewFolder}>
          New Folder
        </Button>
      )}
      {rootPath && currentDir && !scanning && fileClipboard && (
        <Button variant="default" size="sm" onClick={() => onPaste(currentDir)}>
          Paste {fileClipboard.paths.length} item{fileClipboard.paths.length === 1 ? '' : 's'}
        </Button>
      )}
      {rootPath && !scanning && (
        <Button
          variant="default"
          size="sm"
          onClick={onUndo}
          disabled={undoStack.length === 0}
          title={undoStack.length > 0 ? `Undo ${describeFileAction(undoStack[undoStack.length - 1])}` : undefined}
        >
          Undo
        </Button>
      )}
      {rootPath && !scanning && (
        <Button
          variant="default"
          size="sm"
          onClick={onRedo}
          disabled={redoStack.length === 0}
          title={redoStack.length > 0 ? `Redo ${describeFileAction(redoStack[redoStack.length - 1])}` : undefined}
        >
          Redo
        </Button>
      )}
      {rootPath && !scanning && selectedCount > 0 && (
        <Button variant="light" color="red" size="sm" onClick={onDeleteClick}>
          Delete {selectedCount} item{selectedCount === 1 ? '' : 's'}
        </Button>
      )}
      {rootPath && !scanning && trashCount > 0 && (
        <Button variant="default" size="sm" onClick={onEmptyTrashClick}>
          Empty Trash ({trashCount})
        </Button>
      )}
      {rootPath && (
        <PinnedPopover
          opened={pinnedPanelOpen}
          setOpened={setPinnedPanelOpen}
          pinnedRows={pinnedRows}
          onClearPinned={onClearPinned}
          onUnpin={onUnpin}
          onSelectPinned={onSelectPinned}
        />
      )}
      {rootPath && savedViews && (
        <SavedViewsPopover
          opened={savedViewsPanelOpen}
          setOpened={setSavedViewsPanelOpen}
          savedViews={savedViews}
          onLoadView={onLoadView}
          onDeleteView={onDeleteView}
          onOpenSaveView={onOpenSaveView}
        />
      )}
      {rootPath && (
        <StoragePopover opened={storagePanelOpen} setOpened={setStoragePanelOpen} storageBreakdown={storageBreakdown} />
      )}
      <Button variant="default" size="sm" leftSection={<IconSettings size={14} />} onClick={onOpenSettings} style={{ marginLeft: 'auto' }}>
        Settings
      </Button>
      {scanning && (
        <Button variant="default" size="sm" onClick={onCancelScan}>
          Cancel
        </Button>
      )}
      {scanning && <Text size="sm">Scanning… {scanned} found</Text>}
      {!scanning && rootPath && !error && <Text size="sm">{total} items</Text>}
      {error && (
        <Text size="sm" c="red">
          Error: {error}
        </Text>
      )}
      {health && !scanning && (
        <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
          {health.fileCount.toLocaleString()} indexed · {formatBytes(health.dbSizeBytes)} cache ·{' '}
          {health.lastScanAt ? `scanned ${new Date(health.lastScanAt).toLocaleTimeString()}` : 'not scanned yet'} ·{' '}
          watcher {health.watcherActive ? 'active' : 'inactive'}
        </Text>
      )}
    </Group>
  )
}
