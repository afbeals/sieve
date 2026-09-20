import { Menu } from '@mantine/core'
import type { FileRow } from '../../../shared/types'

export interface RowContextMenuProps {
  contextMenu: { x: number; y: number; row: FileRow | null } | null
  onClose: () => void
  selectedCount: number
  allSelectedPinned: boolean
  fileClipboard: { paths: string[]; mode: 'copy' | 'cut' } | null
  currentDir: string | null
  onActivateRow: (row: FileRow) => void
  onStartRename: (row: FileRow) => void
  onStartBulkRename: () => void
  onDuplicate: () => void
  onCut: () => void
  onCopy: () => void
  onPaste: (destDir: string) => void
  onCopyPath: () => void
  onRevealInFolder: (row: FileRow) => void
  onTogglePinSelected: () => void
  onDeleteClick: () => void
  onNewFolder: () => void
}

export function RowContextMenu({
  contextMenu,
  onClose,
  selectedCount,
  allSelectedPinned,
  fileClipboard,
  currentDir,
  onActivateRow,
  onStartRename,
  onStartBulkRename,
  onDuplicate,
  onCut,
  onCopy,
  onPaste,
  onCopyPath,
  onRevealInFolder,
  onTogglePinSelected,
  onDeleteClick,
  onNewFolder
}: RowContextMenuProps): React.JSX.Element {
  return (
    <Menu opened={!!contextMenu} onClose={onClose} position="bottom-start" shadow="md" width={190}>
      <Menu.Target>
        <div style={{ position: 'fixed', top: contextMenu?.y ?? 0, left: contextMenu?.x ?? 0, width: 0, height: 0 }} />
      </Menu.Target>
      <Menu.Dropdown>
        {contextMenu?.row ? (
          <>
            {selectedCount === 1 && <Menu.Item onClick={() => onActivateRow(contextMenu.row as FileRow)}>Open</Menu.Item>}
            {selectedCount <= 1 ? (
              <Menu.Item onClick={() => onStartRename(contextMenu.row as FileRow)}>Rename</Menu.Item>
            ) : (
              <Menu.Item onClick={onStartBulkRename}>Rename {selectedCount} items…</Menu.Item>
            )}
            <Menu.Item onClick={onDuplicate}>Duplicate</Menu.Item>
            <Menu.Item onClick={onCut}>Cut</Menu.Item>
            <Menu.Item onClick={onCopy}>Copy</Menu.Item>
            {Boolean(contextMenu.row.isDirectory) && fileClipboard && (
              <Menu.Item onClick={() => onPaste((contextMenu.row as FileRow).path)}>Paste here</Menu.Item>
            )}
            <Menu.Item onClick={onCopyPath}>Copy Path{selectedCount > 1 ? 's' : ''}</Menu.Item>
            <Menu.Item onClick={() => onRevealInFolder(contextMenu.row as FileRow)}>Reveal in folder</Menu.Item>
            <Menu.Item onClick={onTogglePinSelected}>
              {allSelectedPinned
                ? `Unpin ${selectedCount > 1 ? `${selectedCount} items` : ''}`
                : `Pin ${selectedCount > 1 ? `${selectedCount} items` : ''}`}
            </Menu.Item>
            <Menu.Item color="red" onClick={onDeleteClick}>
              Delete
            </Menu.Item>
          </>
        ) : (
          <>
            <Menu.Item onClick={onNewFolder}>New Folder</Menu.Item>
            {fileClipboard && currentDir && (
              <Menu.Item onClick={() => onPaste(currentDir)}>
                Paste {fileClipboard.paths.length} item{fileClipboard.paths.length === 1 ? '' : 's'}
              </Menu.Item>
            )}
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )
}
