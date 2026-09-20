import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  FileOpError,
  bulkRename,
  copyPaths,
  createNewFolder,
  deletePaths,
  duplicatePaths,
  emptyTrash,
  getTrashCount,
  getTrashDir,
  movePaths,
  purgeOldTrash,
  removePaths,
  renamePath
} from '../fileOps'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sieve-fileops-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function file(relPath: string, contents = ''): string {
  const abs = join(root, relPath)
  writeFileSync(abs, contents)
  return abs
}

function dir(relPath: string): string {
  const abs = join(root, relPath)
  mkdirSync(abs, { recursive: true })
  return abs
}

describe('createNewFolder', () => {
  it('creates "New Folder" in the given directory', () => {
    const target = createNewFolder(root)
    expect(target).toBe(join(root, 'New Folder'))
    expect(existsSync(target)).toBe(true)
  })

  it('auto-increments instead of colliding with an existing folder', () => {
    dir('New Folder')
    const target = createNewFolder(root)
    expect(target).toBe(join(root, 'New Folder (2)'))
  })
})

describe('renamePath', () => {
  it('renames a file to the new name', () => {
    const original = file('a.txt')
    const target = renamePath(original, 'b.txt')
    expect(target).toBe(join(root, 'b.txt'))
    expect(existsSync(target)).toBe(true)
    expect(existsSync(original)).toBe(false)
  })

  it('is a no-op that returns the original path when the name is unchanged', () => {
    const original = file('a.txt')
    expect(renamePath(original, 'a.txt')).toBe(original)
  })

  it('throws a FileOpError instead of overwriting an existing name', () => {
    file('a.txt')
    const other = file('b.txt')
    expect(() => renamePath(other, 'a.txt')).toThrow(FileOpError)
  })

  it('throws a FileOpError for an empty name', () => {
    const original = file('a.txt')
    expect(() => renamePath(original, '   ')).toThrow(FileOpError)
  })

  it('throws a FileOpError for a name containing a path separator', () => {
    const original = file('a.txt')
    expect(() => renamePath(original, 'nested/b.txt')).toThrow(FileOpError)
  })
})

describe('bulkRename', () => {
  it('gives the first item the base name and numbers the rest, keeping each extension', () => {
    const a = file('one.jpg')
    const b = file('two.png')
    const c = file('three.jpg')
    const result = bulkRename([a, b, c], 'vacation')
    expect(result).toEqual([
      { oldPath: a, newPath: join(root, 'vacation.jpg') },
      { oldPath: b, newPath: join(root, 'vacation (2).png') },
      { oldPath: c, newPath: join(root, 'vacation (3).jpg') }
    ])
    expect(existsSync(join(root, 'vacation.jpg'))).toBe(true)
    expect(existsSync(join(root, 'vacation (2).png'))).toBe(true)
    expect(existsSync(join(root, 'vacation (3).jpg'))).toBe(true)
  })

  it('does not append an extension to a renamed directory', () => {
    const folder = dir('old-folder')
    const result = bulkRename([folder], 'new-folder')
    expect(result).toEqual([{ oldPath: folder, newPath: join(root, 'new-folder') }])
  })
})

describe('movePaths', () => {
  it('moves a file into the destination directory', () => {
    const source = file('a.txt')
    const dest = dir('dest')
    const result = movePaths([source], dest)
    expect(result).toEqual([{ oldPath: source, newPath: join(dest, 'a.txt') }])
    expect(existsSync(source)).toBe(false)
    expect(existsSync(join(dest, 'a.txt'))).toBe(true)
  })

  it('skips an item that is already directly in the destination', () => {
    const dest = dir('dest')
    const alreadyThere = file('dest/a.txt')
    expect(movePaths([alreadyThere], dest)).toEqual([])
    expect(existsSync(alreadyThere)).toBe(true)
  })

  it('auto-increments on a name collision instead of overwriting', () => {
    const dest = dir('dest')
    file('dest/a.txt', 'existing')
    const source = file('a.txt', 'incoming')
    const result = movePaths([source], dest)
    expect(result).toEqual([{ oldPath: source, newPath: join(dest, 'a (2).txt') }])
  })

  it('throws a FileOpError when moving a folder into itself', () => {
    const folder = dir('folder')
    expect(() => movePaths([folder], folder)).toThrow(FileOpError)
  })

  it('throws a FileOpError when moving a folder into its own descendant', () => {
    const folder = dir('folder')
    const nested = dir('folder/nested')
    expect(() => movePaths([folder], nested)).toThrow(FileOpError)
  })
})

describe('copyPaths', () => {
  it('copies a file, leaving the original in place', () => {
    const source = file('a.txt', 'hello')
    const dest = dir('dest')
    const result = copyPaths([source], dest)
    expect(result).toEqual([{ oldPath: source, newPath: join(dest, 'a.txt') }])
    expect(existsSync(source)).toBe(true)
    expect(existsSync(join(dest, 'a.txt'))).toBe(true)
  })

  it('throws a FileOpError when copying a folder into itself', () => {
    const folder = dir('folder')
    expect(() => copyPaths([folder], folder)).toThrow(FileOpError)
  })
})

describe('duplicatePaths', () => {
  it('appends "(copy)" to the duplicate', () => {
    const source = file('a.txt')
    const result = duplicatePaths([source])
    expect(result).toEqual([{ oldPath: source, newPath: join(root, 'a (copy).txt') }])
  })

  it('numbers subsequent duplicates as "(copy 2)", "(copy 3)", ...', () => {
    const source = file('a.txt')
    duplicatePaths([source])
    const result = duplicatePaths([source])
    expect(result).toEqual([{ oldPath: source, newPath: join(root, 'a (copy 2).txt') }])
  })
})

describe('removePaths', () => {
  it('deletes the given paths outright', () => {
    const a = file('a.txt')
    removePaths([a])
    expect(existsSync(a)).toBe(false)
  })
})

describe('soft-delete lifecycle (deletePaths / getTrashCount / emptyTrash)', () => {
  it('moves a deleted file into the trash directory under the root', () => {
    const a = file('a.txt')
    const result = deletePaths(root, [a])
    expect(result).toEqual([{ oldPath: a, newPath: join(getTrashDir(root), 'a.txt') }])
    expect(existsSync(a)).toBe(false)
    expect(getTrashCount(root)).toBe(1)
  })

  it('reports zero trash count when nothing has been trashed yet', () => {
    expect(getTrashCount(root)).toBe(0)
  })

  it('permanently removes everything in the trash on emptyTrash', () => {
    const a = file('a.txt')
    deletePaths(root, [a])
    emptyTrash(root)
    expect(getTrashCount(root)).toBe(0)
    expect(existsSync(getTrashDir(root))).toBe(false)
  })
})

describe('purgeOldTrash', () => {
  it('removes only entries older than the cutoff, by their trashed-at mtime', () => {
    const oldFile = file('old.txt')
    const newFile = file('new.txt')
    deletePaths(root, [oldFile, newFile])

    const trashDir = getTrashDir(root)
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000
    utimesSync(join(trashDir, 'old.txt'), fortyDaysAgo / 1000, fortyDaysAgo / 1000)

    const purged = purgeOldTrash(root, 30)
    expect(purged).toBe(1)
    expect(existsSync(join(trashDir, 'old.txt'))).toBe(false)
    expect(existsSync(join(trashDir, 'new.txt'))).toBe(true)
  })

  it('returns 0 when the trash directory does not exist yet', () => {
    expect(purgeOldTrash(root, 30)).toBe(0)
  })
})
