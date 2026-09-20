/// <reference types="vite/client" />

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
} from '../../shared/types'

declare global {
  interface Window {
    api: {
      ping: () => string
      pickRoot: () => Promise<string | null>
      startScan: (rootPath: string) => Promise<void>
      cancelScan: () => Promise<void>
      getIndexHealth: (rootPath: string) => Promise<IndexHealth>
      queryListing: (params: QueryListingParams) => Promise<ListingResult>
      queryAllMatching: (params: QueryListingParams) => Promise<FileRow[]>
      previewFilterCount: (params: FilterPreviewParams) => Promise<number>
      getListingAggregate: (params: FilterPreviewParams) => Promise<ListingAggregate>
      getStorageBreakdown: (params: FilterPreviewParams) => Promise<StorageBreakdownEntry[]>
      recordPattern: (pattern: string, mode: FilterMode) => Promise<void>
      getPatternHistory: (limit: number) => Promise<PatternHistoryEntry[]>
      analyzeWords: (params: FilterPreviewParams) => Promise<WordFrequencyEntry[]>
      getThumbnails: (path: string) => Promise<ThumbnailFramePreview[]>
      getThumbnailIcon: (path: string) => Promise<string | null>
      getOriginalMedia: (path: string) => Promise<string | null>
      newFolder: (parentDir: string) => Promise<string>
      renamePath: (path: string, newName: string) => Promise<string>
      bulkRename: (paths: string[], baseName: string) => Promise<PathMapping[]>
      movePaths: (paths: string[], destDir: string) => Promise<PathMapping[]>
      copyPaths: (paths: string[], destDir: string) => Promise<PathMapping[]>
      duplicatePaths: (paths: string[]) => Promise<PathMapping[]>
      removePaths: (paths: string[]) => Promise<void>
      deletePaths: (rootPath: string, paths: string[]) => Promise<PathMapping[]>
      emptyTrash: (rootPath: string) => Promise<void>
      getTrashCount: (rootPath: string) => Promise<number>
      getSettings: () => Promise<AppSettings>
      updateSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
      exportConfig: () => Promise<boolean>
      importConfig: () => Promise<AppSettings | null>
      revealInFolder: (path: string) => Promise<void>
      openPath: (path: string) => Promise<string>
      copyPathsToClipboard: (paths: string[]) => Promise<void>
      onScanProgress: (callback: (payload: ScanProgressPayload) => void) => () => void
      onScanDone: (callback: (payload: ScanDonePayload) => void) => () => void
      onScanError: (callback: (payload: ScanErrorPayload) => void) => () => void
      onWatchChanged: (callback: (payload: WatchChangedPayload) => void) => () => void
      onThumbnailProgress: (callback: (payload: ThumbnailProgressPayload) => void) => () => void
      onThumbnailDone: (callback: (payload: ThumbnailDonePayload) => void) => () => void
      onThumbnailFileReady: (callback: (payload: ThumbnailFileReadyPayload) => void) => () => void
    }
  }
}

export {}
