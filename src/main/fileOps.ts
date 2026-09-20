import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, sep } from 'node:path'
import { TRASH_DIR_NAME } from './paths'
import type { PathMapping } from '../shared/types'

// Thrown for expected, user-facing failures (name collisions, invalid names, moving a folder
// into itself) so the renderer can show the message as-is instead of a generic "operation
// failed". Anything else (permissions, disk errors) surfaces as a plain Error with its own
// message, which is still fine to show as-is.
export class FileOpError extends Error {}

function splitNameAndExt(name: string, isDirectory: boolean): { base: string; ext: string } {
  const ext = isDirectory ? '' : extname(name)
  return { base: name.slice(0, name.length - ext.length), ext }
}

// Every op that lands in an existing directory (move, copy, new folder) auto-increments
// instead of overwriting - matching Explorer/Finder's default "keep both" behavior rather
// than silently clobbering an existing file.
function uniquePath(dir: string, name: string, isDirectory: boolean): string {
  const candidate = join(dir, name)
  if (!existsSync(candidate)) return candidate
  const { base, ext } = splitNameAndExt(name, isDirectory)
  let counter = 2
  let next = join(dir, `${base} (${counter})${ext}`)
  while (existsSync(next)) {
    counter += 1
    next = join(dir, `${base} (${counter})${ext}`)
  }
  return next
}

function assertValidName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new FileOpError('Name cannot be empty')
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new FileOpError('Name cannot contain a path separator')
  }
  return trimmed
}

// True when targetPath is candidateAncestor itself or lives underneath it - used to block
// moving/copying a folder into itself or one of its own descendants, which would otherwise
// either no-op destructively or recurse into the copy it's still writing.
function isSameOrDescendant(candidateAncestor: string, targetPath: string): boolean {
  return targetPath === candidateAncestor || targetPath.startsWith(`${candidateAncestor}${sep}`)
}

export function createNewFolder(parentDir: string): string {
  const target = uniquePath(parentDir, 'New Folder', true)
  mkdirSync(target)
  return target
}

export function renamePath(path: string, newName: string): string {
  const trimmed = assertValidName(newName)
  const dir = dirname(path)
  const target = join(dir, trimmed)
  if (target === path) return path
  if (existsSync(target)) throw new FileOpError(`"${trimmed}" already exists`)
  renameSync(path, target)
  return target
}

// Explorer-style bulk rename: the first selected item takes the base name as-is, every
// subsequent item gets "base (2)", "base (3)", ... - each keeping its own original extension.
export function bulkRename(paths: string[], baseName: string): PathMapping[] {
  const trimmed = assertValidName(baseName)
  return paths.map((path, index) => {
    const dir = dirname(path)
    const isDirectory = statSync(path).isDirectory()
    const ext = isDirectory ? '' : extname(path)
    const candidateName = index === 0 ? `${trimmed}${ext}` : `${trimmed} (${index + 1})${ext}`
    const target = uniquePath(dir, candidateName, isDirectory)
    if (target !== path) renameSync(path, target)
    return { oldPath: path, newPath: target }
  })
}

export function movePaths(paths: string[], destDir: string): PathMapping[] {
  const results: PathMapping[] = []
  for (const path of paths) {
    if (dirname(path) === destDir) continue
    if (isSameOrDescendant(path, destDir)) {
      throw new FileOpError(`Cannot move "${basename(path)}" into itself`)
    }
    const isDirectory = statSync(path).isDirectory()
    const target = uniquePath(destDir, basename(path), isDirectory)
    try {
      renameSync(path, target)
    } catch (error) {
      // EXDEV: source and destination are on different filesystems/devices, where a plain
      // rename can never work - fall back to a real copy then remove the original.
      if ((error as NodeJS.ErrnoException).code === 'EXDEV') {
        cpSync(path, target, { recursive: true })
        rmSync(path, { recursive: true, force: true })
      } else {
        throw error
      }
    }
    results.push({ oldPath: path, newPath: target })
  }
  return results
}

export function copyPaths(paths: string[], destDir: string): PathMapping[] {
  const results: PathMapping[] = []
  for (const path of paths) {
    if (isSameOrDescendant(path, destDir)) {
      throw new FileOpError(`Cannot copy "${basename(path)}" into itself`)
    }
    const isDirectory = statSync(path).isDirectory()
    const target = uniquePath(destDir, basename(path), isDirectory)
    cpSync(path, target, { recursive: true })
    results.push({ oldPath: path, newPath: target })
  }
  return results
}

export function duplicatePaths(paths: string[]): PathMapping[] {
  const results: PathMapping[] = []
  for (const path of paths) {
    const dir = dirname(path)
    const isDirectory = statSync(path).isDirectory()
    const { base, ext } = splitNameAndExt(basename(path), isDirectory)
    let counter = 1
    let target = join(dir, `${base} (copy)${ext}`)
    while (existsSync(target)) {
      counter += 1
      target = join(dir, `${base} (copy ${counter})${ext}`)
    }
    cpSync(path, target, { recursive: true })
    results.push({ oldPath: path, newPath: target })
  }
  return results
}

// Undo-only removal: undoing a New Folder / Copy / Duplicate means deleting what that action
// created, outright (not to the trash below - a copy/duplicate's undo has nothing to restore,
// there's no "original" to move back to). Not exposed as a general "Delete" feature.
export function removePaths(paths: string[]): void {
  for (const path of paths) {
    rmSync(path, { recursive: true, force: true })
  }
}

export function getTrashDir(rootPath: string): string {
  return join(rootPath, TRASH_DIR_NAME)
}

// Soft delete: moves into a same-volume trash folder under the scanned root rather than the
// OS Recycle Bin/Trash, since programmatically restoring from the OS trash isn't reliably
// cross-platform (Mac vs. Windows) - see the plan's architecture notes. Reuses movePaths so it
// gets the same collision-avoidance and cross-device fallback for free, and its result is a
// PathMapping[] the renderer's undo stack can restore from directly (move each newPath back to
// dirnameFallback(oldPath)).
export function deletePaths(rootPath: string, paths: string[]): PathMapping[] {
  const trashDir = getTrashDir(rootPath)
  mkdirSync(trashDir, { recursive: true })
  return movePaths(paths, trashDir)
}

export function emptyTrash(rootPath: string): void {
  rmSync(getTrashDir(rootPath), { recursive: true, force: true })
}

export function getTrashCount(rootPath: string): number {
  try {
    return readdirSync(getTrashDir(rootPath)).length
  } catch {
    return 0
  }
}

// Settings-driven (trash.autoPurgeDays, off/manual by default - see settings.ts). Age is
// judged by mtime of the trashed entry itself (its move-into-trash time, for a file/folder
// whose own mtime isn't touched by a plain rename), not its original mtime before deletion.
export function purgeOldTrash(rootPath: string, olderThanDays: number): number {
  const trashDir = getTrashDir(rootPath)
  let entries: string[]
  try {
    entries = readdirSync(trashDir)
  } catch {
    return 0
  }
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000
  let purged = 0
  for (const entry of entries) {
    const entryPath = join(trashDir, entry)
    try {
      if (statSync(entryPath).mtimeMs < cutoff) {
        rmSync(entryPath, { recursive: true, force: true })
        purged += 1
      }
    } catch {
      // Entry may have been removed/renamed by something else since readdirSync - skip it.
    }
  }
  return purged
}
