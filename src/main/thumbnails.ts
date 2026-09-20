import { app } from 'electron'
import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { loadSettings } from './settings'
import { getMediaKind } from '../shared/media'
import type { MediaKind } from '../shared/types'

export { getMediaKind, getMediaExtensions } from '../shared/media'

export function frameCountFor(kind: MediaKind): number {
  return kind === 'video' ? loadSettings().thumbnails.videoFrameCount : 1
}

let thumbnailDir: string | null = null

export function getThumbnailDir(): string {
  if (thumbnailDir) return thumbnailDir
  thumbnailDir = join(app.getPath('userData'), 'thumbnails')
  mkdirSync(thumbnailDir, { recursive: true })
  return thumbnailDir
}

export function getThumbnailPath(filePath: string, frameIndex: number): string {
  const hash = createHash('sha1').update(filePath).digest('hex')
  return join(getThumbnailDir(), `${hash}_${frameIndex}.jpg`)
}

// electron-builder can't run a binary from inside app.asar; packaging must unpack these
// (asarUnpack) so this substitution finds the real file at runtime. No-op outside an asar build.
export function resolveBinaryPath(rawPath: string): string {
  return rawPath.replace('app.asar', 'app.asar.unpacked')
}

export interface ThumbnailJob {
  path: string
  mtimeMs: number
  kind: MediaKind
  // outputPaths[frameIndex] = absolute path the worker should write that frame to.
  // Precomputed here (main-process side, the only side allowed to call app.getPath) so the
  // worker thread never needs to import 'electron' itself - matching scanner-worker.ts and
  // word-frequency-worker.ts, which are also Electron-API-free by design.
  outputPaths: string[]
  // Read from settings at job-build time and threaded through explicitly, since
  // thumbnail-worker.ts is Electron-API-free and can't call loadSettings() itself. Changing
  // this setting only affects thumbnails generated after the change - the cache key
  // (getThumbnailPath) isn't resolution-aware, so already-generated thumbnails won't
  // regenerate at the new size on their own.
  resolution: number
}

export function buildThumbnailJob(path: string, ext: string, mtimeMs: number): ThumbnailJob | null {
  const kind = getMediaKind(ext)
  if (!kind) return null
  const frameCount = frameCountFor(kind)
  const outputPaths = Array.from({ length: frameCount }, (_, frameIndex) => getThumbnailPath(path, frameIndex))
  return { path, mtimeMs, kind, outputPaths, resolution: loadSettings().thumbnails.resolution }
}
