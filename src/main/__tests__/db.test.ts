import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileRow, FilterRule, ListingScope } from '../../shared/types'

// getDb() resolves its file path via `app.getPath('userData')`. Mocking that to a fresh temp
// directory per test gives each test a real, disposable SQLite database (Node 22+'s built-in
// node:sqlite, the same engine the app itself uses) instead of a mocked query layer - so these
// tests exercise the actual SQL, including the ORDER BY tiebreaker fix below.
let tempDir: string
vi.mock('electron', () => ({ app: { getPath: () => tempDir } }))

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'sieve-db-'))
  vi.resetModules()
})

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true })
})

async function loadDb(): Promise<typeof import('../db')> {
  return import('../db')
}

const ROOT = '/root'

function makeRow(overrides: Partial<FileRow> & { path: string; name: string }): FileRow {
  return {
    parentDir: ROOT,
    ext: '',
    size: 100,
    ctimeMs: 1000,
    mtimeMs: 1000,
    isDirectory: 0,
    ...overrides
  }
}

describe('upsertEntries / deleteStale / queryListing (scope)', () => {
  it('returns only rows directly inside the folder in "folder" mode', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/a.txt', name: 'a.txt' }),
        makeRow({ path: '/root/sub/b.txt', name: 'b.txt', parentDir: '/root/sub' })
      ],
      1
    )
    const scope: ListingScope = { mode: 'folder', dirPath: ROOT }
    const rows = db.queryListing({
      scope,
      filterRules: [],
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.path)).toEqual(['/root/a.txt'])
  })

  it('returns every descendant in "recursive" mode', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/a.txt', name: 'a.txt' }),
        makeRow({ path: '/root/sub/b.txt', name: 'b.txt', parentDir: '/root/sub' })
      ],
      1
    )
    const scope: ListingScope = { mode: 'recursive', dirPath: ROOT }
    const rows = db.queryListing({
      scope,
      filterRules: [],
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.path).sort()).toEqual(['/root/a.txt', '/root/sub/b.txt'])
  })

  it('removes rows not seen in the latest scan for that root', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/stale.txt', name: 'stale.txt' })], 1)
    db.upsertEntries(ROOT, [makeRow({ path: '/root/fresh.txt', name: 'fresh.txt' })], 2)
    db.deleteStale(ROOT, 2)

    const rows = db.queryAllMatching({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: [],
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.path)).toEqual(['/root/fresh.txt'])
  })
})

describe('pagination stability with many tied sort keys (regression: scroll-jitter fix)', () => {
  it('paginating queryListing reconstructs exactly the same order as one unpaginated query, with no duplicates or gaps', async () => {
    const db = await loadDb()
    // Many rows sharing the same `name` (as happens in recursive mode with real-world
    // duplicate filenames like "job", "BUILD.bazel", etc.) is exactly the condition that
    // exposed the original bug: without a secondary tiebreaker, SQLite does not guarantee a
    // stable order among tied rows across separate LIMIT/OFFSET calls.
    const tied: FileRow[] = Array.from({ length: 24 }, (_, i) =>
      makeRow({ path: `/root/dir${i}/job`, name: 'job', parentDir: `/root/dir${i}`, isDirectory: 1 })
    )
    const distinct: FileRow[] = Array.from({ length: 6 }, (_, i) => makeRow({ path: `/root/file${i}.txt`, name: `file${i}.txt` }))
    db.upsertEntries(ROOT, [...tied, ...distinct], 1)

    const scope: ListingScope = { mode: 'recursive', dirPath: ROOT }
    const params = {
      scope,
      filterRules: [] as FilterRule[],
      quickFilters: { extensions: [] },
      sortField: 'name' as const,
      sortDir: 'asc' as const,
      limit: 30,
      offset: 0
    }

    const fullOrder = db.queryAllMatching(params).map((r) => r.path)
    expect(fullOrder).toHaveLength(30)

    const pageSize = 7
    const paginated: string[] = []
    for (let offset = 0; offset < fullOrder.length; offset += pageSize) {
      const page = db.queryListing({ ...params, limit: pageSize, offset })
      paginated.push(...page.map((r) => r.path))
    }

    expect(paginated).toHaveLength(fullOrder.length)
    expect(new Set(paginated).size).toBe(fullOrder.length)
    expect(paginated).toEqual(fullOrder)
  })
})

describe('filterClause via queryListing (regex filter rules)', () => {
  it('matches a fuzzy (literal, case-insensitive) pattern', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [makeRow({ path: '/root/Vacation.jpg', name: 'Vacation.jpg' }), makeRow({ path: '/root/work.jpg', name: 'work.jpg' })],
      1
    )
    const rules: FilterRule[] = [{ id: '1', pattern: 'vacation', mode: 'fuzzy', invert: false, combinator: 'AND' }]
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: rules,
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['Vacation.jpg'])
  })

  it('supports strict regex mode', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/img001.jpg', name: 'img001.jpg' }), makeRow({ path: '/root/note.txt', name: 'note.txt' })], 1)
    const rules: FilterRule[] = [{ id: '1', pattern: '^img\\d+\\.jpg$', mode: 'strict', invert: false, combinator: 'AND' }]
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: rules,
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['img001.jpg'])
  })

  it('inverts a rule with the invert flag', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/a.jpg', name: 'a.jpg' }), makeRow({ path: '/root/b.png', name: 'b.png' })], 1)
    const rules: FilterRule[] = [{ id: '1', pattern: 'jpg', mode: 'fuzzy', invert: true, combinator: 'AND' }]
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: rules,
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['b.png'])
  })

  it('combines two rules with OR', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/a.jpg', name: 'a.jpg' }),
        makeRow({ path: '/root/b.png', name: 'b.png' }),
        makeRow({ path: '/root/c.txt', name: 'c.txt' })
      ],
      1
    )
    const rules: FilterRule[] = [
      { id: '1', pattern: 'jpg', mode: 'fuzzy', invert: false, combinator: 'AND' },
      { id: '2', pattern: 'png', mode: 'fuzzy', invert: false, combinator: 'OR' }
    ]
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: rules,
      quickFilters: { extensions: [] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name).sort()).toEqual(['a.jpg', 'b.png'])
  })
})

describe('quickFilterClause via queryListing', () => {
  it('filters by extension', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/a.jpg', name: 'a.jpg', ext: 'jpg' }), makeRow({ path: '/root/b.png', name: 'b.png', ext: 'png' })], 1)
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: [],
      quickFilters: { extensions: ['jpg'] },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['a.jpg'])
  })

  it('filters by minimum size', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/small.txt', name: 'small.txt', size: 10 }), makeRow({ path: '/root/big.txt', name: 'big.txt', size: 1000 })], 1)
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: [],
      quickFilters: { extensions: [], minSizeBytes: 500 },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['big.txt'])
  })

  it('filters by modified-after date', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/old.txt', name: 'old.txt', mtimeMs: 1000 }),
        makeRow({ path: '/root/new.txt', name: 'new.txt', mtimeMs: 5000 })
      ],
      1
    )
    const rows = db.queryListing({
      scope: { mode: 'recursive', dirPath: ROOT },
      filterRules: [],
      quickFilters: { extensions: [], modifiedAfterMs: 4000 },
      sortField: 'name',
      sortDir: 'asc',
      limit: 50,
      offset: 0
    })
    expect(rows.map((r) => r.name)).toEqual(['new.txt'])
  })
})

describe('aggregates', () => {
  it('countListing counts matching rows', async () => {
    const db = await loadDb()
    db.upsertEntries(ROOT, [makeRow({ path: '/root/a.txt', name: 'a.txt' }), makeRow({ path: '/root/b.txt', name: 'b.txt' })], 1)
    expect(db.countListing({ mode: 'recursive', dirPath: ROOT })).toBe(2)
  })

  it('getListingAggregate sums size across files only, excluding directories', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/a.txt', name: 'a.txt', size: 100 }),
        makeRow({ path: '/root/dir', name: 'dir', size: 0, isDirectory: 1 }),
        makeRow({ path: '/root/b.txt', name: 'b.txt', size: 200 })
      ],
      1
    )
    const aggregate = db.getListingAggregate({ mode: 'recursive', dirPath: ROOT })
    expect(aggregate).toEqual({ count: 3, totalSizeBytes: 300 })
  })

  it('getStorageBreakdown groups files by extension, largest total first', async () => {
    const db = await loadDb()
    db.upsertEntries(
      ROOT,
      [
        makeRow({ path: '/root/a.jpg', name: 'a.jpg', ext: 'jpg', size: 100 }),
        makeRow({ path: '/root/b.jpg', name: 'b.jpg', ext: 'jpg', size: 100 }),
        makeRow({ path: '/root/c.mp4', name: 'c.mp4', ext: 'mp4', size: 500 })
      ],
      1
    )
    const breakdown = db.getStorageBreakdown({ mode: 'recursive', dirPath: ROOT })
    expect(breakdown).toEqual([
      { ext: 'mp4', count: 1, totalSizeBytes: 500 },
      { ext: 'jpg', count: 2, totalSizeBytes: 200 }
    ])
  })
})

describe('pattern history', () => {
  // recordPatternUsage timestamps with Date.now(), so two real calls back-to-back can land in
  // the same millisecond and tie - fake time gives each call an unambiguous, distinct instant.
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('records and retrieves patterns, most recently used first', async () => {
    const db = await loadDb()
    vi.setSystemTime(1000)
    db.recordPatternUsage('foo', 'fuzzy')
    vi.setSystemTime(2000)
    db.recordPatternUsage('bar', 'strict')
    const history = db.getPatternHistory(10)
    expect(history.map((h) => h.pattern)).toEqual(['bar', 'foo'])
  })

  it('re-recording an existing pattern updates its usage time instead of duplicating it', async () => {
    const db = await loadDb()
    vi.setSystemTime(1000)
    db.recordPatternUsage('foo', 'fuzzy')
    vi.setSystemTime(2000)
    db.recordPatternUsage('bar', 'strict')
    vi.setSystemTime(3000)
    db.recordPatternUsage('foo', 'fuzzy')
    const history = db.getPatternHistory(10)
    expect(history).toHaveLength(2)
    expect(history[0].pattern).toBe('foo')
  })
})
