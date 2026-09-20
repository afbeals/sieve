import { vi } from 'vitest'
import type {
  AppSettings,
  FileRow,
  FilterMode,
  FilterPreviewParams,
  IndexHealth,
  ListingAggregate,
  ListingResult,
  PathMapping,
  PatternHistoryEntry,
  QueryListingParams,
  ScanDonePayload,
  ScanErrorPayload,
  ScanProgressPayload,
  StorageBreakdownEntry,
  ThumbnailDonePayload,
  ThumbnailFileReadyPayload,
  ThumbnailFramePreview,
  ThumbnailProgressPayload,
  WatchChangedPayload,
  WordFrequencyEntry
} from '../../../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  thumbnails: { videoFrameCount: 6, resolution: 800 },
  performance: { workerConcurrency: 2 },
  trash: { autoPurgeDays: null },
  theme: 'system',
  defaultSortField: 'name',
  defaultSortDir: 'asc',
  defaultViewMode: 'table',
  columnWidths: null,
  savedViews: []
}

export type MockApi = Window['api'] & {
  // Test-only escape hatches that invoke whatever callback the component registered via the
  // corresponding `on*` subscription, so a test can simulate a main-process event (scan done,
  // thumbnail progress, ...) without a real IPC round trip.
  fireScanProgress: (payload: ScanProgressPayload) => void
  fireScanDone: (payload: ScanDonePayload) => void
  fireScanError: (payload: ScanErrorPayload) => void
  fireWatchChanged: (payload: WatchChangedPayload) => void
  fireThumbnailProgress: (payload: ThumbnailProgressPayload) => void
  fireThumbnailDone: (payload: ThumbnailDonePayload) => void
  fireThumbnailFileReady: (payload: ThumbnailFileReadyPayload) => void
}

// Builds a fake `window.api` matching the preload contract (env.d.ts), with harmless empty/
// zero defaults for every call and every method as a `vi.fn()` so a test can both assert on
// calls and override a return value. Pass `overrides` for the handful of calls a given test
// actually cares about; everything else just resolves to a safe default.
export function createMockApi(overrides: Partial<Window['api']> = {}): MockApi {
  let scanProgressCb: ((payload: ScanProgressPayload) => void) | null = null
  let scanDoneCb: ((payload: ScanDonePayload) => void) | null = null
  let scanErrorCb: ((payload: ScanErrorPayload) => void) | null = null
  let watchChangedCb: ((payload: WatchChangedPayload) => void) | null = null
  let thumbnailProgressCb: ((payload: ThumbnailProgressPayload) => void) | null = null
  let thumbnailDoneCb: ((payload: ThumbnailDonePayload) => void) | null = null
  let thumbnailFileReadyCb: ((payload: ThumbnailFileReadyPayload) => void) | null = null

  const base: MockApi = {
    ping: vi.fn(() => 'pong'),
    pickRoot: vi.fn(async () => '/root'),
    startScan: vi.fn(async (_rootPath: string) => {}),
    cancelScan: vi.fn(async () => {}),
    getIndexHealth: vi.fn(
      async (rootPath: string): Promise<IndexHealth> => ({
        rootPath,
        fileCount: 0,
        dbSizeBytes: 0,
        lastScanAt: null,
        watcherActive: false
      })
    ),
    queryListing: vi.fn(async (_params: QueryListingParams): Promise<ListingResult> => ({ rows: [], total: 0 })),
    queryAllMatching: vi.fn(async (_params: QueryListingParams): Promise<FileRow[]> => []),
    previewFilterCount: vi.fn(async (_params: FilterPreviewParams) => 0),
    getListingAggregate: vi.fn(
      async (_params: FilterPreviewParams): Promise<ListingAggregate> => ({ count: 0, totalSizeBytes: 0 })
    ),
    getStorageBreakdown: vi.fn(async (_params: FilterPreviewParams): Promise<StorageBreakdownEntry[]> => []),
    recordPattern: vi.fn(async (_pattern: string, _mode: FilterMode) => {}),
    getPatternHistory: vi.fn(async (_limit: number): Promise<PatternHistoryEntry[]> => []),
    analyzeWords: vi.fn(async (_params: FilterPreviewParams): Promise<WordFrequencyEntry[]> => []),
    getThumbnails: vi.fn(async (_path: string): Promise<ThumbnailFramePreview[]> => []),
    getThumbnailIcon: vi.fn(async (_path: string): Promise<string | null> => null),
    getOriginalMedia: vi.fn(async (_path: string): Promise<string | null> => null),
    newFolder: vi.fn(async (parentDir: string) => `${parentDir}/New Folder`),
    renamePath: vi.fn(async (path: string, _newName: string) => path),
    bulkRename: vi.fn(async (_paths: string[], _baseName: string): Promise<PathMapping[]> => []),
    movePaths: vi.fn(async (_paths: string[], _destDir: string): Promise<PathMapping[]> => []),
    copyPaths: vi.fn(async (_paths: string[], _destDir: string): Promise<PathMapping[]> => []),
    duplicatePaths: vi.fn(async (_paths: string[]): Promise<PathMapping[]> => []),
    removePaths: vi.fn(async (_paths: string[]) => {}),
    deletePaths: vi.fn(async (_rootPath: string, _paths: string[]): Promise<PathMapping[]> => []),
    emptyTrash: vi.fn(async (_rootPath: string) => {}),
    getTrashCount: vi.fn(async (_rootPath: string) => 0),
    getSettings: vi.fn(async (): Promise<AppSettings> => ({ ...DEFAULT_SETTINGS })),
    updateSettings: vi.fn(async (partial: Partial<AppSettings>): Promise<AppSettings> => ({ ...DEFAULT_SETTINGS, ...partial })),
    exportConfig: vi.fn(async () => true),
    importConfig: vi.fn(async (): Promise<AppSettings | null> => null),
    revealInFolder: vi.fn(async (_path: string) => {}),
    openPath: vi.fn(async (_path: string) => ''),
    copyPathsToClipboard: vi.fn(async (_paths: string[]) => {}),
    onScanProgress: vi.fn((callback: (payload: ScanProgressPayload) => void) => {
      scanProgressCb = callback
      return () => {
        scanProgressCb = null
      }
    }),
    onScanDone: vi.fn((callback: (payload: ScanDonePayload) => void) => {
      scanDoneCb = callback
      return () => {
        scanDoneCb = null
      }
    }),
    onScanError: vi.fn((callback: (payload: ScanErrorPayload) => void) => {
      scanErrorCb = callback
      return () => {
        scanErrorCb = null
      }
    }),
    onWatchChanged: vi.fn((callback: (payload: WatchChangedPayload) => void) => {
      watchChangedCb = callback
      return () => {
        watchChangedCb = null
      }
    }),
    onThumbnailProgress: vi.fn((callback: (payload: ThumbnailProgressPayload) => void) => {
      thumbnailProgressCb = callback
      return () => {
        thumbnailProgressCb = null
      }
    }),
    onThumbnailDone: vi.fn((callback: (payload: ThumbnailDonePayload) => void) => {
      thumbnailDoneCb = callback
      return () => {
        thumbnailDoneCb = null
      }
    }),
    onThumbnailFileReady: vi.fn((callback: (payload: ThumbnailFileReadyPayload) => void) => {
      thumbnailFileReadyCb = callback
      return () => {
        thumbnailFileReadyCb = null
      }
    }),
    fireScanProgress: (payload) => scanProgressCb?.(payload),
    fireScanDone: (payload) => scanDoneCb?.(payload),
    fireScanError: (payload) => scanErrorCb?.(payload),
    fireWatchChanged: (payload) => watchChangedCb?.(payload),
    fireThumbnailProgress: (payload) => thumbnailProgressCb?.(payload),
    fireThumbnailDone: (payload) => thumbnailDoneCb?.(payload),
    fireThumbnailFileReady: (payload) => thumbnailFileReadyCb?.(payload)
  }

  return { ...base, ...overrides }
}
