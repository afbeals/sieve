import type { FileAction } from './types'

export function basenameFallback(path: string): string {
  const segments = path.split(/[/\\]/).filter(Boolean)
  return segments[segments.length - 1] ?? path
}

// No node:path in the renderer (contextIsolation with no nodeIntegration) - this only needs
// to strip the last real separator that's actually present in an absolute path already
// produced by the main process, not to be a general-purpose path utility.
export function dirnameFallback(path: string): string {
  const separatorIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return separatorIndex === -1 ? path : path.slice(0, separatorIndex)
}

export function describeFileAction(action: FileAction): string {
  switch (action.type) {
    case 'newFolder':
      return `New Folder "${basenameFallback(action.path)}"`
    case 'rename':
      return `Rename to "${basenameFallback(action.newPath)}"`
    case 'bulkRename':
      return `Bulk Rename (${action.renames.length} item${action.renames.length === 1 ? '' : 's'})`
    case 'move':
      return `Move (${action.moves.length} item${action.moves.length === 1 ? '' : 's'})`
    case 'copy':
      return `Copy (${action.created.length} item${action.created.length === 1 ? '' : 's'})`
    case 'duplicate':
      return `Duplicate (${action.created.length} item${action.created.length === 1 ? '' : 's'})`
    case 'delete':
      return `Delete (${action.deletions.length} item${action.deletions.length === 1 ? '' : 's'})`
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`
}
