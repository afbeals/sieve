import { app, BrowserWindow, shell, ipcMain, dialog, clipboard } from 'electron'
import { basename, dirname, join, sep } from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { getExtension, TRASH_DIR_NAME } from './paths'
import { Worker } from 'node:worker_threads'
import { watch as chokidarWatch, type FSWatcher } from 'chokidar'
import {
  upsertEntries,
  upsertEntry,
  deleteStale,
  deletePathAndDescendants,
  queryListing,
  queryAllMatching,
  countListing,
  getListingAggregate,
  getStorageBreakdown,
  recordPatternUsage,
  getPatternHistory,
  getAllNames,
  getMediaFilesNeedingThumbnails,
  upsertThumbnails,
  getThumbnails,
  getFirstThumbnail,
  deleteThumbnailFrame,
  getFileByPath
} from './db'
import { buildThumbnailJob, getMediaExtensions, type ThumbnailJob } from './thumbnails'
import {
  bulkRename,
  copyPaths,
  createNewFolder,
  deletePaths,
  duplicatePaths,
  emptyTrash,
  getTrashCount,
  movePaths,
  purgeOldTrash,
  removePaths,
  renamePath
} from './fileOps'
import { exportSettingsToFile, importSettingsFromFile, loadSettings, saveSettings } from './settings'
import type {
  AppSettings,
  FileRow,
  FilterMode,
  FilterPreviewParams,
  QueryListingParams,
  ThumbnailFrame,
  ThumbnailFramePreview,
  WordFrequencyEntry
} from '../shared/types'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
let activeWatcher: FSWatcher | null = null
let activeWatcherRootPath: string | null = null
const lastScanAt = new Map<string, number>()

interface ScanMessage {
  type: 'batch' | 'done' | 'error'
  entries?: FileRow[]
  total?: number
  error?: string
}

interface ActiveScan {
  worker: Worker
  rootPath: string
  scanned: number
}

let activeScan: ActiveScan | null = null

interface ThumbnailWorkerMessage {
  type: 'result' | 'done'
  path?: string
  mtimeMs?: number
  frames?: ThumbnailFrame[]
}

interface ActiveThumbnailRun {
  workers: Set<Worker>
  rootPath: string
  total: number
  processed: number
}

let activeThumbnailRun: ActiveThumbnailRun | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function handleWatchEvent(rootPath: string, event: string, changedPath: string): Promise<void> {
  try {
    if (event === 'unlink' || event === 'unlinkDir') {
      deletePathAndDescendants(changedPath)
    } else {
      const stats = await stat(changedPath)
      const isDirectory = stats.isDirectory()
      upsertEntry(rootPath, {
        path: changedPath,
        name: basename(changedPath),
        parentDir: dirname(changedPath),
        ext: isDirectory ? '' : getExtension(changedPath),
        size: stats.size,
        ctimeMs: stats.ctimeMs,
        mtimeMs: stats.mtimeMs,
        isDirectory: isDirectory ? 1 : 0
      })
    }
  } catch {
    // The path may have changed again before we could stat it; the next
    // watcher event (or the next relaunch reconciliation) will settle it.
  }
  mainWindow?.webContents.send('watch:changed', { rootPath })
}

function startWatcher(rootPath: string): void {
  activeWatcher?.close()
  const trashDir = join(rootPath, TRASH_DIR_NAME)
  activeWatcher = chokidarWatch(rootPath, {
    ignoreInitial: true,
    ignored: (watchedPath: string) => watchedPath === trashDir || watchedPath.startsWith(`${trashDir}${sep}`)
  })
  activeWatcherRootPath = rootPath
  activeWatcher.on('all', (event, changedPath) => {
    void handleWatchEvent(rootPath, event, changedPath)
  })
}

function startScan(rootPath: string): void {
  activeScan?.worker.terminate()

  const scanStartedAt = Date.now()
  const worker = new Worker(join(__dirname, 'scanner-worker.js'), { workerData: { rootPath } })
  activeScan = { worker, rootPath, scanned: 0 }

  worker.on('message', (message: ScanMessage) => {
    if (message.type === 'batch' && message.entries) {
      upsertEntries(rootPath, message.entries, scanStartedAt)
      if (activeScan?.worker === worker) {
        activeScan.scanned += message.entries.length
        mainWindow?.webContents.send('scan:progress', { rootPath, scanned: activeScan.scanned })
      }
    } else if (message.type === 'done') {
      deleteStale(rootPath, scanStartedAt)
      lastScanAt.set(rootPath, Date.now())
      const scanned = activeScan?.scanned ?? message.total ?? 0
      activeScan = null
      mainWindow?.webContents.send('scan:done', { rootPath, total: message.total ?? scanned, cancelled: false })
      startWatcher(rootPath)
      startThumbnailGeneration(rootPath)
      const autoPurgeDays = loadSettings().trash.autoPurgeDays
      if (autoPurgeDays !== null) purgeOldTrash(rootPath, autoPurgeDays)
    } else if (message.type === 'error') {
      activeScan = null
      mainWindow?.webContents.send('scan:error', { rootPath, error: message.error })
    }
  })

  worker.on('error', (error: Error) => {
    activeScan = null
    mainWindow?.webContents.send('scan:error', { rootPath, error: error.message })
  })
}

function cancelScan(): void {
  if (!activeScan) return
  const { rootPath, scanned, worker } = activeScan
  void worker.terminate()
  activeScan = null
  mainWindow?.webContents.send('scan:done', { rootPath, total: scanned, cancelled: true })
}

// Only formats the renderer can play/decode directly as an <img> source - not a general
// "serve any file" endpoint. Used for the preview panel's animated-GIF case, so a GIF plays
// instead of showing its static first-frame thumbnail.
const ANIMATABLE_MIME_TYPES: Record<string, string> = { gif: 'image/gif' }

async function getOriginalMediaDataUrl(path: string): Promise<string | null> {
  const mime = ANIMATABLE_MIME_TYPES[getExtension(path)]
  if (!mime) return null
  try {
    const buffer = await readFile(path)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch {
    return null
  }
}

async function getThumbnailPreviews(path: string): Promise<ThumbnailFramePreview[]> {
  const frames = getThumbnails(path)
  let hadStaleRow = false
  const previews = await Promise.all(
    frames.map(async (frame): Promise<ThumbnailFramePreview | null> => {
      try {
        const buffer = await readFile(frame.thumbPath)
        return { frameIndex: frame.frameIndex, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` }
      } catch {
        // The DB row outlived its file - e.g. an app restart landed mid-write. Drop the stale
        // row so it doesn't keep masking a missing thumbnail forever, and regenerate it now
        // instead of waiting for the next full Rescan.
        deleteThumbnailFrame(path, frame.frameIndex)
        hadStaleRow = true
        return null
      }
    })
  )
  if (hadStaleRow) regenerateThumbnail(path)
  return previews.filter((preview): preview is ThumbnailFramePreview => preview !== null)
}

async function getThumbnailIconDataUrl(path: string): Promise<string | null> {
  const frame = getFirstThumbnail(path)
  if (!frame) return null
  try {
    const buffer = await readFile(frame.thumbPath)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  } catch {
    // Stale DB row (file missing) - not worth regenerating just for a row icon; the file's
    // own preview/carousel fetch (getThumbnailPreviews) already handles that case when the
    // file is actually selected.
    deleteThumbnailFrame(path, frame.frameIndex)
    return null
  }
}

function regenerateThumbnail(path: string): void {
  const file = getFileByPath(path)
  if (!file) return
  const job = buildThumbnailJob(file.path, file.ext, file.mtimeMs)
  if (!job) return

  const worker = new Worker(join(__dirname, 'thumbnail-worker.js'), { workerData: { jobs: [job] } })
  worker.on('message', (message: ThumbnailWorkerMessage) => {
    if (message.type === 'result' && message.path && message.mtimeMs !== undefined && message.frames) {
      upsertThumbnails(message.path, message.mtimeMs, message.frames)
      mainWindow?.webContents.send('thumbnails:fileReady', { path: message.path })
    } else if (message.type === 'done') {
      void worker.terminate()
    }
  })
  worker.on('error', (error: Error) => {
    console.error('Thumbnail regeneration error', error)
  })
}

function terminateActiveThumbnailRun(): void {
  if (!activeThumbnailRun) return
  for (const worker of activeThumbnailRun.workers) void worker.terminate()
  activeThumbnailRun = null
}

// Splits the job list across `performance.workerConcurrency` parallel worker threads instead
// of one worker processing everything sequentially - each still processes its own chunk
// sequentially (ffmpeg is already using every core it wants per-job), so this mainly helps
// when a single video's probe/seek is slow enough to stall the whole queue behind it.
function startThumbnailGeneration(rootPath: string): void {
  const candidates = getMediaFilesNeedingThumbnails(rootPath, getMediaExtensions())
  const jobs = candidates
    .map((file) => buildThumbnailJob(file.path, file.ext, file.mtimeMs))
    .filter((job): job is ThumbnailJob => job !== null)

  terminateActiveThumbnailRun()
  if (jobs.length === 0) return

  const concurrency = Math.max(1, Math.min(loadSettings().performance.workerConcurrency, jobs.length))
  const chunkSize = Math.ceil(jobs.length / concurrency)
  const chunks: ThumbnailJob[][] = []
  for (let i = 0; i < jobs.length; i += chunkSize) chunks.push(jobs.slice(i, i + chunkSize))

  const run: ActiveThumbnailRun = { workers: new Set(), rootPath, total: jobs.length, processed: 0 }
  activeThumbnailRun = run
  mainWindow?.webContents.send('thumbnails:progress', { rootPath, processed: 0, total: jobs.length })

  const finishWorker = (worker: Worker): void => {
    void worker.terminate()
    if (activeThumbnailRun !== run) return
    run.workers.delete(worker)
    if (run.workers.size === 0) {
      activeThumbnailRun = null
      mainWindow?.webContents.send('thumbnails:done', { rootPath })
    }
  }

  for (const chunk of chunks) {
    const worker = new Worker(join(__dirname, 'thumbnail-worker.js'), { workerData: { jobs: chunk } })
    run.workers.add(worker)

    worker.on('message', (message: ThumbnailWorkerMessage) => {
      if (message.type === 'result' && message.path && message.mtimeMs !== undefined && message.frames) {
        upsertThumbnails(message.path, message.mtimeMs, message.frames)
        mainWindow?.webContents.send('thumbnails:fileReady', { path: message.path })
        if (activeThumbnailRun === run) {
          run.processed += 1
          mainWindow?.webContents.send('thumbnails:progress', { rootPath, processed: run.processed, total: run.total })
        }
      } else if (message.type === 'done') {
        finishWorker(worker)
      }
    })

    worker.on('error', (error: Error) => {
      console.error('Thumbnail worker error', error)
      finishWorker(worker)
    })
  }
}

function analyzeWords(params: FilterPreviewParams): Promise<WordFrequencyEntry[]> {
  const names = getAllNames(params.scope, params.filterRules, params.quickFilters)

  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'word-frequency-worker.js'), { workerData: { names } })
    worker.once('message', (message: { words: WordFrequencyEntry[] }) => {
      resolve(message.words)
      void worker.terminate()
    })
    worker.once('error', reject)
  })
}

async function getIndexHealth(rootPath: string): Promise<{
  rootPath: string
  fileCount: number
  dbSizeBytes: number
  lastScanAt: number | null
  watcherActive: boolean
}> {
  const dbPath = join(app.getPath('userData'), 'sieve-index.db')
  let dbSizeBytes = 0
  try {
    dbSizeBytes = (await stat(dbPath)).size
  } catch {
    dbSizeBytes = 0
  }

  return {
    rootPath,
    fileCount: countListing({ mode: 'recursive', dirPath: rootPath }),
    dbSizeBytes,
    lastScanAt: lastScanAt.get(rootPath) ?? null,
    watcherActive: activeWatcherRootPath === rootPath
  }
}

app.whenReady().then(() => {
  createWindow()

  ipcMain.handle('dialog:pickRoot', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('scan:start', (_event, rootPath: string) => {
    startScan(rootPath)
  })

  ipcMain.handle('scan:cancel', () => {
    cancelScan()
  })

  ipcMain.handle('index:health', (_event, rootPath: string) => {
    return getIndexHealth(rootPath)
  })

  ipcMain.handle('listing:query', (_event, params: QueryListingParams) => {
    return {
      rows: queryListing(params),
      total: countListing(params.scope, params.filterRules, params.quickFilters)
    }
  })

  ipcMain.handle('listing:queryAll', (_event, params: QueryListingParams) => {
    return queryAllMatching(params)
  })

  ipcMain.handle('filter:previewCount', (_event, params: FilterPreviewParams) => {
    return countListing(params.scope, params.filterRules, params.quickFilters)
  })

  ipcMain.handle('listing:aggregate', (_event, params: FilterPreviewParams) => {
    return getListingAggregate(params.scope, params.filterRules, params.quickFilters)
  })

  ipcMain.handle('listing:storageBreakdown', (_event, params: FilterPreviewParams) => {
    return getStorageBreakdown(params.scope, params.filterRules, params.quickFilters)
  })

  ipcMain.handle('filter:recordPattern', (_event, pattern: string, mode: FilterMode) => {
    recordPatternUsage(pattern, mode)
  })

  ipcMain.handle('filter:getPatternHistory', (_event, limit: number) => {
    return getPatternHistory(limit)
  })

  ipcMain.handle('words:analyze', (_event, params: FilterPreviewParams) => {
    return analyzeWords(params)
  })

  ipcMain.handle('thumbnails:get', (_event, path: string) => {
    return getThumbnailPreviews(path)
  })

  ipcMain.handle('thumbnails:getIcon', (_event, path: string) => {
    return getThumbnailIconDataUrl(path)
  })

  ipcMain.handle('media:getOriginal', (_event, path: string) => {
    return getOriginalMediaDataUrl(path)
  })

  // These perform the raw filesystem operation only - no direct DB writes. The already-running
  // chokidar watcher (see handleWatchEvent above) picks up the resulting add/unlink events the
  // same way it would for a change made outside the app (e.g. in Finder), so the index stays
  // correct without a second, parallel code path to keep in sync.
  ipcMain.handle('fs:newFolder', (_event, parentDir: string) => {
    return createNewFolder(parentDir)
  })

  ipcMain.handle('fs:rename', (_event, path: string, newName: string) => {
    return renamePath(path, newName)
  })

  ipcMain.handle('fs:bulkRename', (_event, paths: string[], baseName: string) => {
    return bulkRename(paths, baseName)
  })

  ipcMain.handle('fs:move', (_event, paths: string[], destDir: string) => {
    return movePaths(paths, destDir)
  })

  ipcMain.handle('fs:copy', (_event, paths: string[], destDir: string) => {
    return copyPaths(paths, destDir)
  })

  ipcMain.handle('fs:duplicate', (_event, paths: string[]) => {
    return duplicatePaths(paths)
  })

  // Undo-only - see removePaths in fileOps.ts.
  ipcMain.handle('fs:remove', (_event, paths: string[]) => {
    removePaths(paths)
  })

  ipcMain.handle('fs:delete', (_event, rootPath: string, paths: string[]) => {
    return deletePaths(rootPath, paths)
  })

  ipcMain.handle('fs:emptyTrash', (_event, rootPath: string) => {
    emptyTrash(rootPath)
  })

  ipcMain.handle('fs:trashCount', (_event, rootPath: string) => {
    return getTrashCount(rootPath)
  })

  ipcMain.handle('settings:get', () => {
    return loadSettings()
  })

  ipcMain.handle('settings:update', (_event, partial: Partial<AppSettings>) => {
    return saveSettings(partial)
  })

  ipcMain.handle('settings:export', async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: 'sieve-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return false
    exportSettingsToFile(result.filePath)
    return true
  })

  ipcMain.handle('settings:import', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return importSettingsFromFile(result.filePaths[0])
  })

  ipcMain.handle('fs:revealInFolder', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  // shell.openPath resolves with an empty string on success, or an error message on failure -
  // it does not reject, so the renderer checks the returned string rather than catching.
  ipcMain.handle('fs:openPath', (_event, path: string) => {
    return shell.openPath(path)
  })

  ipcMain.handle('fs:copyPathsToClipboard', (_event, paths: string[]) => {
    clipboard.writeText(paths.join('\n'))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  activeWatcher?.close()
  activeScan?.worker.terminate()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
