import { DatabaseSync } from 'node:sqlite'
import { app } from 'electron'
import { rmSync } from 'node:fs'
import { join, sep } from 'node:path'
import type {
  FileRow,
  FilterMode,
  FilterRule,
  ListingAggregate,
  ListingScope,
  PatternHistoryEntry,
  QueryListingParams,
  QuickFilters,
  StorageBreakdownEntry,
  ThumbnailFrame
} from '../shared/types'

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (db) return db

  const dbPath = join(app.getPath('userData'), 'sieve-index.db')
  db = new DatabaseSync(dbPath)

  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentDir TEXT NOT NULL,
      ext TEXT NOT NULL,
      size INTEGER NOT NULL,
      ctimeMs REAL NOT NULL,
      mtimeMs REAL NOT NULL,
      isDirectory INTEGER NOT NULL,
      rootPath TEXT NOT NULL,
      lastSeenAt INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_files_rootPath ON files(rootPath);
    CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
    CREATE INDEX IF NOT EXISTS idx_files_size ON files(size);
    CREATE INDEX IF NOT EXISTS idx_files_mtimeMs ON files(mtimeMs);
    CREATE INDEX IF NOT EXISTS idx_files_ctimeMs ON files(ctimeMs);

    CREATE TABLE IF NOT EXISTS pattern_history (
      pattern TEXT NOT NULL,
      mode TEXT NOT NULL,
      lastUsedAt INTEGER NOT NULL,
      PRIMARY KEY (pattern, mode)
    );

    CREATE TABLE IF NOT EXISTS thumbnails (
      path TEXT NOT NULL,
      frameIndex INTEGER NOT NULL,
      mtimeMs REAL NOT NULL,
      thumbPath TEXT NOT NULL,
      PRIMARY KEY (path, frameIndex)
    );
  `)

  db.function('regex_match', { deterministic: true }, (pattern: unknown, mode: unknown, value: unknown) => {
    const compiled = getCompiledRegex(String(pattern), String(mode))
    if (!compiled) return 0
    return compiled.test(String(value)) ? 1 : 0
  })

  return db
}

const regexCache = new Map<string, RegExp | null>()

function escapeForFuzzy(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getCompiledRegex(pattern: string, mode: string): RegExp | null {
  const key = `${mode}:${pattern}`
  if (regexCache.has(key)) return regexCache.get(key) ?? null

  let compiled: RegExp | null
  try {
    compiled = mode === 'fuzzy' ? new RegExp(escapeForFuzzy(pattern), 'i') : new RegExp(pattern)
  } catch {
    compiled = null
  }
  regexCache.set(key, compiled)
  return compiled
}

export function upsertEntries(rootPath: string, entries: FileRow[], scanStartedAt: number): void {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT INTO files (path, name, parentDir, ext, size, ctimeMs, mtimeMs, isDirectory, rootPath, lastSeenAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET
      name = excluded.name,
      parentDir = excluded.parentDir,
      ext = excluded.ext,
      size = excluded.size,
      ctimeMs = excluded.ctimeMs,
      mtimeMs = excluded.mtimeMs,
      isDirectory = excluded.isDirectory,
      rootPath = excluded.rootPath,
      lastSeenAt = excluded.lastSeenAt
  `)

  database.exec('BEGIN')
  try {
    for (const entry of entries) {
      stmt.run(
        entry.path,
        entry.name,
        entry.parentDir,
        entry.ext,
        entry.size,
        entry.ctimeMs,
        entry.mtimeMs,
        entry.isDirectory,
        rootPath,
        scanStartedAt
      )
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}

export function deleteStale(rootPath: string, scanStartedAt: number): void {
  getDb()
    .prepare('DELETE FROM files WHERE rootPath = ? AND lastSeenAt != ?')
    .run(rootPath, scanStartedAt)
}

export function upsertEntry(rootPath: string, entry: FileRow): void {
  upsertEntries(rootPath, [entry], Date.now())
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export function deletePathAndDescendants(targetPath: string): void {
  const database = getDb()
  const escapedPrefix = escapeLikePattern(`${targetPath}${sep}`)

  const orphanedThumbs = database
    .prepare("SELECT thumbPath FROM thumbnails WHERE path = ? OR path LIKE ? ESCAPE '\\'")
    .all(targetPath, `${escapedPrefix}%`) as { thumbPath: string }[]

  database.exec('BEGIN')
  try {
    database.prepare('DELETE FROM files WHERE path = ?').run(targetPath)
    database.prepare("DELETE FROM files WHERE path LIKE ? ESCAPE '\\'").run(`${escapedPrefix}%`)
    database.prepare('DELETE FROM thumbnails WHERE path = ?').run(targetPath)
    database.prepare("DELETE FROM thumbnails WHERE path LIKE ? ESCAPE '\\'").run(`${escapedPrefix}%`)
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  for (const row of orphanedThumbs) {
    rmSync(row.thumbPath, { force: true })
  }
}

export function upsertThumbnails(path: string, mtimeMs: number, frames: ThumbnailFrame[]): void {
  const database = getDb()
  const oldRows = database.prepare('SELECT thumbPath FROM thumbnails WHERE path = ?').all(path) as {
    thumbPath: string
  }[]

  database.exec('BEGIN')
  try {
    database.prepare('DELETE FROM thumbnails WHERE path = ?').run(path)
    const stmt = database.prepare(
      'INSERT INTO thumbnails (path, frameIndex, mtimeMs, thumbPath) VALUES (?, ?, ?, ?)'
    )
    for (const frame of frames) {
      stmt.run(path, frame.frameIndex, mtimeMs, frame.thumbPath)
    }
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }

  const currentPaths = new Set(frames.map((frame) => frame.thumbPath))
  for (const row of oldRows) {
    if (!currentPaths.has(row.thumbPath)) rmSync(row.thumbPath, { force: true })
  }
}

export function getThumbnails(path: string): ThumbnailFrame[] {
  return getDb()
    .prepare('SELECT frameIndex, thumbPath FROM thumbnails WHERE path = ? ORDER BY frameIndex ASC')
    .all(path) as unknown as ThumbnailFrame[]
}

// Row icons (main-view thumbnail-as-icon): only ever needs frame 0, and skips reading/encoding
// the other up-to-5 video frames that getThumbnails() would otherwise return.
export function getFirstThumbnail(path: string): ThumbnailFrame | undefined {
  return getDb()
    .prepare('SELECT frameIndex, thumbPath FROM thumbnails WHERE path = ? ORDER BY frameIndex ASC LIMIT 1')
    .get(path) as unknown as ThumbnailFrame | undefined
}

export function deleteThumbnailFrame(path: string, frameIndex: number): void {
  getDb().prepare('DELETE FROM thumbnails WHERE path = ? AND frameIndex = ?').run(path, frameIndex)
}

export function getFileByPath(path: string): FileRow | undefined {
  return getDb()
    .prepare('SELECT path, name, parentDir, ext, size, ctimeMs, mtimeMs, isDirectory FROM files WHERE path = ?')
    .get(path) as unknown as FileRow | undefined
}

export function getMediaFilesNeedingThumbnails(rootPath: string, mediaExtensions: string[]): FileRow[] {
  if (mediaExtensions.length === 0) return []
  const placeholders = mediaExtensions.map(() => '?').join(', ')
  return getDb()
    .prepare(
      `SELECT path, name, parentDir, ext, size, ctimeMs, mtimeMs, isDirectory
       FROM files
       WHERE rootPath = ? AND isDirectory = 0 AND ext IN (${placeholders})
         AND NOT EXISTS (
           SELECT 1 FROM thumbnails t WHERE t.path = files.path AND t.mtimeMs = files.mtimeMs
         )`
    )
    .all(rootPath, ...mediaExtensions) as unknown as FileRow[]
}

const SORTABLE_FIELDS = new Set(['name', 'size', 'ctimeMs', 'mtimeMs'])

function scopeClause(scope: ListingScope): { clause: string; value: string } {
  if (scope.mode === 'folder') {
    return { clause: 'parentDir = ?', value: scope.dirPath }
  }
  const escapedPrefix = escapeLikePattern(`${scope.dirPath}${sep}`)
  return { clause: "path LIKE ? ESCAPE '\\'", value: `${escapedPrefix}%` }
}

function filterClause(rules: FilterRule[]): { clause: string; params: (string | number)[] } {
  if (rules.length === 0) return { clause: '1 = 1', params: [] }

  let clause = ''
  const params: (string | number)[] = []

  rules.forEach((rule, index) => {
    const ruleSql = rule.invert ? 'regex_match(?, ?, name) = 0' : 'regex_match(?, ?, name) = 1'
    clause = index === 0 ? `(${ruleSql})` : `(${clause} ${rule.combinator} (${ruleSql}))`
    params.push(rule.pattern, rule.mode)
  })

  return { clause, params }
}

function quickFilterClause(quickFilters: QuickFilters): { clause: string; params: (string | number)[] } {
  const parts: string[] = []
  const params: (string | number)[] = []

  if (quickFilters.extensions.length > 0) {
    const placeholders = quickFilters.extensions.map(() => '?').join(', ')
    parts.push(`ext IN (${placeholders})`)
    params.push(...quickFilters.extensions)
  }
  if (quickFilters.minSizeBytes !== undefined) {
    parts.push('size >= ?')
    params.push(quickFilters.minSizeBytes)
  }
  if (quickFilters.modifiedAfterMs !== undefined) {
    parts.push('mtimeMs >= ?')
    params.push(quickFilters.modifiedAfterMs)
  }

  if (parts.length === 0) return { clause: '1 = 1', params: [] }
  return { clause: parts.join(' AND '), params }
}

const EMPTY_QUICK_FILTERS: QuickFilters = { extensions: [] }

export function queryListing(params: QueryListingParams): FileRow[] {
  const sortField = SORTABLE_FIELDS.has(params.sortField) ? params.sortField : 'name'
  const sortDir = params.sortDir === 'desc' ? 'DESC' : 'ASC'
  const scope = scopeClause(params.scope)
  const filter = filterClause(params.filterRules)
  const quick = quickFilterClause(params.quickFilters)

  const stmt = getDb().prepare(`
    SELECT path, name, parentDir, ext, size, ctimeMs, mtimeMs, isDirectory
    FROM files
    WHERE ${scope.clause} AND ${filter.clause} AND ${quick.clause}
    ORDER BY ${sortField} ${sortDir}, path ASC
    LIMIT ? OFFSET ?
  `)

  return stmt.all(scope.value, ...filter.params, ...quick.params, params.limit, params.offset) as unknown as FileRow[]
}

export function queryAllMatching(params: QueryListingParams): FileRow[] {
  const sortField = SORTABLE_FIELDS.has(params.sortField) ? params.sortField : 'name'
  const sortDir = params.sortDir === 'desc' ? 'DESC' : 'ASC'
  const scope = scopeClause(params.scope)
  const filter = filterClause(params.filterRules)
  const quick = quickFilterClause(params.quickFilters)

  const stmt = getDb().prepare(`
    SELECT path, name, parentDir, ext, size, ctimeMs, mtimeMs, isDirectory
    FROM files
    WHERE ${scope.clause} AND ${filter.clause} AND ${quick.clause}
    ORDER BY ${sortField} ${sortDir}, path ASC
  `)

  return stmt.all(scope.value, ...filter.params, ...quick.params) as unknown as FileRow[]
}

export function countListing(
  scope: ListingScope,
  filterRules: FilterRule[] = [],
  quickFilters: QuickFilters = EMPTY_QUICK_FILTERS
): number {
  const scopeResult = scopeClause(scope)
  const filter = filterClause(filterRules)
  const quick = quickFilterClause(quickFilters)
  const row = getDb()
    .prepare(`SELECT COUNT(*) as count FROM files WHERE ${scopeResult.clause} AND ${filter.clause} AND ${quick.clause}`)
    .get(scopeResult.value, ...filter.params, ...quick.params) as { count: number }
  return row.count
}

export function getListingAggregate(
  scope: ListingScope,
  filterRules: FilterRule[] = [],
  quickFilters: QuickFilters = EMPTY_QUICK_FILTERS
): ListingAggregate {
  const scopeResult = scopeClause(scope)
  const filter = filterClause(filterRules)
  const quick = quickFilterClause(quickFilters)
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(CASE WHEN isDirectory = 0 THEN size ELSE 0 END), 0) as totalSizeBytes
       FROM files
       WHERE ${scopeResult.clause} AND ${filter.clause} AND ${quick.clause}`
    )
    .get(scopeResult.value, ...filter.params, ...quick.params) as { count: number; totalSizeBytes: number }
  return row
}

export function getStorageBreakdown(
  scope: ListingScope,
  filterRules: FilterRule[] = [],
  quickFilters: QuickFilters = EMPTY_QUICK_FILTERS
): StorageBreakdownEntry[] {
  const scopeResult = scopeClause(scope)
  const filter = filterClause(filterRules)
  const quick = quickFilterClause(quickFilters)
  return getDb()
    .prepare(
      `SELECT COALESCE(ext, '') as ext, COUNT(*) as count, COALESCE(SUM(size), 0) as totalSizeBytes
       FROM files
       WHERE ${scopeResult.clause} AND ${filter.clause} AND ${quick.clause} AND isDirectory = 0
       GROUP BY ext
       ORDER BY totalSizeBytes DESC`
    )
    .all(scopeResult.value, ...filter.params, ...quick.params) as unknown as StorageBreakdownEntry[]
}

export function getAllNames(scope: ListingScope, filterRules: FilterRule[], quickFilters: QuickFilters): string[] {
  const scopeResult = scopeClause(scope)
  const filter = filterClause(filterRules)
  const quick = quickFilterClause(quickFilters)

  const rows = getDb()
    .prepare(
      `SELECT name FROM files
       WHERE ${scopeResult.clause} AND ${filter.clause} AND ${quick.clause} AND isDirectory = 0`
    )
    .all(scopeResult.value, ...filter.params, ...quick.params) as { name: string }[]

  return rows.map((row) => row.name)
}

export function recordPatternUsage(pattern: string, mode: FilterMode): void {
  getDb()
    .prepare(
      `INSERT INTO pattern_history (pattern, mode, lastUsedAt)
       VALUES (?, ?, ?)
       ON CONFLICT(pattern, mode) DO UPDATE SET lastUsedAt = excluded.lastUsedAt`
    )
    .run(pattern, mode, Date.now())
}

export function getPatternHistory(limit: number): PatternHistoryEntry[] {
  return getDb()
    .prepare('SELECT pattern, mode, lastUsedAt FROM pattern_history ORDER BY lastUsedAt DESC LIMIT ?')
    .all(limit) as unknown as PatternHistoryEntry[]
}
