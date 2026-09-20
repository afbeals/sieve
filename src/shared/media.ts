import type { MediaKind } from './types'

// ffmpeg-static can't decode SVG (vector) or reliably decode HEIC (needs libheif, not
// compiled into the static build) - those extensions just won't get a thumbnail.
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v'])

export function getMediaKind(ext: string): MediaKind | null {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  return null
}

export function getMediaExtensions(): string[] {
  return [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS]
}
