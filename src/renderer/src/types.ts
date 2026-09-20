import type { FileRow, PathMapping, ThumbnailFramePreview } from '../../shared/types'

export interface StackEntry {
  path: string
  label: string
}

export type GalleryEntry =
  | { kind: 'divider'; label: string; count: number; totalSizeBytes: number }
  | { kind: 'row'; row: FileRow }

export interface PreviewSlot {
  row: FileRow
  frames: ThumbnailFramePreview[]
  animatedUrl: string | null
  carouselIndex: number
}

export type FileAction =
  | { type: 'newFolder'; path: string }
  | { type: 'rename'; oldPath: string; newPath: string }
  | { type: 'bulkRename'; renames: PathMapping[] }
  | { type: 'move'; moves: PathMapping[] }
  | { type: 'copy'; created: PathMapping[] }
  | { type: 'duplicate'; created: PathMapping[] }
  | { type: 'delete'; deletions: PathMapping[] }
