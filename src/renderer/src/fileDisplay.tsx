import { useEffect, useState } from 'react'
import {
  IconFile,
  IconFileText,
  IconFileZip,
  IconFolder,
  IconPhoto,
  IconVideo,
  type Icon as TablerIcon
} from '@tabler/icons-react'
import { getMediaKind } from '../../shared/media'
import type { FileRow } from '../../shared/types'

export const EXTENSION_GROUPS: { label: string; extensions: string[]; icon: TablerIcon }[] = [
  { label: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg'], icon: IconPhoto },
  { label: 'Videos', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'], icon: IconVideo },
  { label: 'Documents', extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'], icon: IconFileText },
  { label: 'Archives', extensions: ['zip', 'rar', '7z', 'tar', 'gz'], icon: IconFileZip }
]

export function getFileIcon(row: FileRow): TablerIcon {
  if (row.isDirectory) return IconFolder
  return EXTENSION_GROUPS.find((group) => group.extensions.includes(row.ext))?.icon ?? IconFile
}

export function FileTypeIcon({ row, size = 16 }: { row: FileRow; size?: number }): React.JSX.Element {
  const Icon = getFileIcon(row)
  return <Icon size={size} style={{ verticalAlign: 'middle', flexShrink: 0 }} />
}

// Row-icon-as-thumbnail: a plain module-level cache (not React state) since it's a rendering
// cache shared across every row/component instance, not app state - once a path's icon is
// fetched, every future mount of that row (e.g. scrolling back into a virtualized view) reads
// it synchronously instead of re-fetching. `undefined` = not yet fetched, `null` = fetched but
// no thumbnail exists (falls back to the Tabler file-type icon).
const thumbnailIconCache = new Map<string, string | null>()

export function useThumbnailIcon(row: FileRow): string | null {
  const mediaKind = row.isDirectory ? null : getMediaKind(row.ext)
  const [iconUrl, setIconUrl] = useState<string | null>(() => (mediaKind ? thumbnailIconCache.get(row.path) ?? null : null))
  useEffect(() => {
    if (!mediaKind) return
    const cached = thumbnailIconCache.get(row.path)
    if (cached !== undefined) {
      setIconUrl(cached)
      return
    }
    let cancelled = false
    void window.api.getThumbnailIcon(row.path).then((url) => {
      thumbnailIconCache.set(row.path, url)
      if (!cancelled) setIconUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [row.path, mediaKind])
  return iconUrl
}

// `fill` renders the image to completely cover its container (the gallery grid's square tile);
// otherwise it's a small inline square next to the file name (table/grouped-list rows),
// matching the fallback icon's footprint via `size`.
export function RowIcon({ row, size, fill }: { row: FileRow; size: number; fill?: boolean }): React.JSX.Element {
  const iconUrl = useThumbnailIcon(row)
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        style={
          fill
            ? { width: '100%', height: '100%', objectFit: 'cover' }
            : { width: size, height: size, objectFit: 'cover', borderRadius: 3, verticalAlign: 'middle' }
        }
      />
    )
  }
  return <FileTypeIcon row={row} size={size} />
}

export function getTypeLabel(row: FileRow): string {
  if (row.isDirectory) return 'Folder'
  return row.ext ? `${row.ext.toUpperCase()} file` : 'File'
}
