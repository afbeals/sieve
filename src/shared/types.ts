export interface FileRow {
  path: string
  name: string
  parentDir: string
  ext: string
  size: number
  ctimeMs: number
  mtimeMs: number
  isDirectory: number
}

export type SortField = 'name' | 'size' | 'ctimeMs' | 'mtimeMs'
export type SortDir = 'asc' | 'desc'

export type ListingMode = 'recursive' | 'folder'

export interface ListingScope {
  mode: ListingMode
  dirPath: string
}

export type FilterMode = 'fuzzy' | 'strict'
export type FilterCombinator = 'AND' | 'OR'

export interface FilterRule {
  id: string
  pattern: string
  mode: FilterMode
  invert: boolean
  combinator: FilterCombinator
}

export interface QuickFilters {
  extensions: string[]
  minSizeBytes?: number
  modifiedAfterMs?: number
}

export interface QueryListingParams {
  scope: ListingScope
  filterRules: FilterRule[]
  quickFilters: QuickFilters
  sortField: SortField
  sortDir: SortDir
  limit: number
  offset: number
}

export interface FilterPreviewParams {
  scope: ListingScope
  filterRules: FilterRule[]
  quickFilters: QuickFilters
}

export interface PatternHistoryEntry {
  pattern: string
  mode: FilterMode
  lastUsedAt: number
}

export interface WordFrequencyEntry {
  word: string
  count: number
}

export interface ListingResult {
  rows: FileRow[]
  total: number
}

export interface ListingAggregate {
  count: number
  totalSizeBytes: number
}

// Storage breakdown (#33): one row per extension within the current scope/filter, so the
// renderer can render a simple bar chart without pulling every file row across the wire.
export interface StorageBreakdownEntry {
  ext: string
  count: number
  totalSizeBytes: number
}

export interface ScanProgressPayload {
  rootPath: string
  scanned: number
}

export interface ScanDonePayload {
  rootPath: string
  total: number
  cancelled?: boolean
}

export interface IndexHealth {
  rootPath: string
  fileCount: number
  dbSizeBytes: number
  lastScanAt: number | null
  watcherActive: boolean
}

export interface ScanErrorPayload {
  rootPath: string
  error: string
}

export interface WatchChangedPayload {
  rootPath: string
}

export type MediaKind = 'image' | 'video'

export interface ThumbnailFrame {
  frameIndex: number
  thumbPath: string
}

// The renderer-facing shape: a data URL instead of a raw path, since the dev-mode renderer
// runs on http://localhost and Chromium blocks file:// loads from a non-file origin.
export interface ThumbnailFramePreview {
  frameIndex: number
  dataUrl: string
}

export interface ThumbnailProgressPayload {
  rootPath: string
  processed: number
  total: number
}

export interface ThumbnailDonePayload {
  rootPath: string
}

export interface ThumbnailFileReadyPayload {
  path: string
}

// Shared shape for any op that turns one existing path into another - rename, move, copy, and
// duplicate all report their results this way so the renderer's undo stack (#28) can treat
// them uniformly instead of needing a separate result type per operation.
export interface PathMapping {
  oldPath: string
  newPath: string
}

// One schema covering everything configurable, doubling as the import/export config file
// (#37/#20). `theme` drives the light/dark toggle (#36/step 23); `columnWidths` and
// `defaultSortField`/`defaultSortDir`/`defaultViewMode` are the persistent-layout fields
// (#32/step 21) - the renderer auto-saves the latter three whenever they change, not just
// through the manual Settings panel.
export interface AppSettings {
  thumbnails: { videoFrameCount: number; resolution: number }
  performance: { workerConcurrency: number }
  trash: { autoPurgeDays: number | null }
  theme: 'light' | 'dark' | 'system'
  defaultSortField: SortField
  defaultSortDir: SortDir
  defaultViewMode: 'table' | 'gallery'
  columnWidths: Record<string, number> | null
  savedViews: SavedView[]
}

// A named bundle of {filters, combinators, sort, grouping, view mode} (#13/step 20) - saved
// and loaded as a whole so a multi-pass triage setup can be recreated in one click instead of
// re-entering every filter/sort/group choice by hand.
export interface SavedView {
  id: string
  name: string
  createdAt: number
  filterRules: FilterRule[]
  activeExtensionGroups: string[]
  activeSizePreset: string | null
  activeDatePreset: string | null
  sortField: SortField
  sortDir: SortDir
  groupWords: string[]
  displayMode: 'table' | 'gallery'
  viewMode: ListingMode
}
