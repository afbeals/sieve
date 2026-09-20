import { contextBridge, ipcRenderer } from 'electron'
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
} from '../shared/types'

const api = {
  ping: (): string => 'pong',

  pickRoot: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickRoot'),

  startScan: (rootPath: string): Promise<void> => ipcRenderer.invoke('scan:start', rootPath),

  cancelScan: (): Promise<void> => ipcRenderer.invoke('scan:cancel'),

  getIndexHealth: (rootPath: string): Promise<IndexHealth> => ipcRenderer.invoke('index:health', rootPath),

  queryListing: (params: QueryListingParams): Promise<ListingResult> =>
    ipcRenderer.invoke('listing:query', params),

  queryAllMatching: (params: QueryListingParams): Promise<FileRow[]> =>
    ipcRenderer.invoke('listing:queryAll', params),

  previewFilterCount: (params: FilterPreviewParams): Promise<number> =>
    ipcRenderer.invoke('filter:previewCount', params),

  getListingAggregate: (params: FilterPreviewParams): Promise<ListingAggregate> =>
    ipcRenderer.invoke('listing:aggregate', params),

  getStorageBreakdown: (params: FilterPreviewParams): Promise<StorageBreakdownEntry[]> =>
    ipcRenderer.invoke('listing:storageBreakdown', params),

  recordPattern: (pattern: string, mode: FilterMode): Promise<void> =>
    ipcRenderer.invoke('filter:recordPattern', pattern, mode),

  getPatternHistory: (limit: number): Promise<PatternHistoryEntry[]> =>
    ipcRenderer.invoke('filter:getPatternHistory', limit),

  analyzeWords: (params: FilterPreviewParams): Promise<WordFrequencyEntry[]> =>
    ipcRenderer.invoke('words:analyze', params),

  getThumbnails: (path: string): Promise<ThumbnailFramePreview[]> => ipcRenderer.invoke('thumbnails:get', path),

  getThumbnailIcon: (path: string): Promise<string | null> => ipcRenderer.invoke('thumbnails:getIcon', path),

  getOriginalMedia: (path: string): Promise<string | null> => ipcRenderer.invoke('media:getOriginal', path),

  newFolder: (parentDir: string): Promise<string> => ipcRenderer.invoke('fs:newFolder', parentDir),

  renamePath: (path: string, newName: string): Promise<string> => ipcRenderer.invoke('fs:rename', path, newName),

  bulkRename: (paths: string[], baseName: string): Promise<PathMapping[]> =>
    ipcRenderer.invoke('fs:bulkRename', paths, baseName),

  movePaths: (paths: string[], destDir: string): Promise<PathMapping[]> =>
    ipcRenderer.invoke('fs:move', paths, destDir),

  copyPaths: (paths: string[], destDir: string): Promise<PathMapping[]> =>
    ipcRenderer.invoke('fs:copy', paths, destDir),

  duplicatePaths: (paths: string[]): Promise<PathMapping[]> => ipcRenderer.invoke('fs:duplicate', paths),

  removePaths: (paths: string[]): Promise<void> => ipcRenderer.invoke('fs:remove', paths),

  deletePaths: (rootPath: string, paths: string[]): Promise<PathMapping[]> =>
    ipcRenderer.invoke('fs:delete', rootPath, paths),

  emptyTrash: (rootPath: string): Promise<void> => ipcRenderer.invoke('fs:emptyTrash', rootPath),

  getTrashCount: (rootPath: string): Promise<number> => ipcRenderer.invoke('fs:trashCount', rootPath),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),

  updateSettings: (partial: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', partial),

  exportConfig: (): Promise<boolean> => ipcRenderer.invoke('settings:export'),

  importConfig: (): Promise<AppSettings | null> => ipcRenderer.invoke('settings:import'),

  revealInFolder: (path: string): Promise<void> => ipcRenderer.invoke('fs:revealInFolder', path),

  openPath: (path: string): Promise<string> => ipcRenderer.invoke('fs:openPath', path),

  copyPathsToClipboard: (paths: string[]): Promise<void> => ipcRenderer.invoke('fs:copyPathsToClipboard', paths),

  onScanProgress: (callback: (payload: ScanProgressPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ScanProgressPayload): void => callback(payload)
    ipcRenderer.on('scan:progress', listener)
    return () => ipcRenderer.removeListener('scan:progress', listener)
  },

  onScanDone: (callback: (payload: ScanDonePayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ScanDonePayload): void => callback(payload)
    ipcRenderer.on('scan:done', listener)
    return () => ipcRenderer.removeListener('scan:done', listener)
  },

  onScanError: (callback: (payload: ScanErrorPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ScanErrorPayload): void => callback(payload)
    ipcRenderer.on('scan:error', listener)
    return () => ipcRenderer.removeListener('scan:error', listener)
  },

  onWatchChanged: (callback: (payload: WatchChangedPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: WatchChangedPayload): void => callback(payload)
    ipcRenderer.on('watch:changed', listener)
    return () => ipcRenderer.removeListener('watch:changed', listener)
  },

  onThumbnailProgress: (callback: (payload: ThumbnailProgressPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ThumbnailProgressPayload): void => callback(payload)
    ipcRenderer.on('thumbnails:progress', listener)
    return () => ipcRenderer.removeListener('thumbnails:progress', listener)
  },

  onThumbnailDone: (callback: (payload: ThumbnailDonePayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ThumbnailDonePayload): void => callback(payload)
    ipcRenderer.on('thumbnails:done', listener)
    return () => ipcRenderer.removeListener('thumbnails:done', listener)
  },

  onThumbnailFileReady: (callback: (payload: ThumbnailFileReadyPayload) => void): (() => void) => {
    const listener = (_event: unknown, payload: ThumbnailFileReadyPayload): void => callback(payload)
    ipcRenderer.on('thumbnails:fileReady', listener)
    return () => ipcRenderer.removeListener('thumbnails:fileReady', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
