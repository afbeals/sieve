# Sieve — Architecture

An Electron desktop app: main process indexes the filesystem into SQLite and does all real file
I/O; renderer process (React) is the UI and owns almost no business logic of its own beyond
orchestrating IPC calls and local view state.

---

## Process Split

```
┌─────────────────────────────────────────────────────────────────────┐
│ Main process (src/main/)                                              │
│                                                                         │
│  index.ts ──┬── ipcMain.handle(...)  (request/response, ~25 channels) │
│              │                                                         │
│              ├── db.ts            SQLite index (node:sqlite)          │
│              ├── fileOps.ts        rename/move/copy/delete/trash       │
│              ├── settings.ts       appConfig.json read/write           │
│              ├── thumbnails.ts     job-building, path/cache helpers    │
│              │                                                         │
│              └── Worker threads (own process-adjacent threads):        │
│                   ├── scanner-worker.ts        recursive fs walk       │
│                   ├── thumbnail-worker.ts       ffmpeg frame extraction│
│                   └── word-frequency-worker.ts  filename tokenizing    │
│                                                                         │
│  chokidar watches the scanned root and keeps the DB live               │
└─────────────────────────────────────────────────────────────────────┘
                              │  IPC (contextBridge, see below)
┌─────────────────────────────────────────────────────────────────────┐
│ Preload (src/preload/index.ts)                                        │
│   contextBridge.exposeInMainWorld('api', { ...typed wrappers... })    │
└─────────────────────────────────────────────────────────────────────┘
                              │  window.api.*
┌─────────────────────────────────────────────────────────────────────┐
│ Renderer (src/renderer/src/)                                          │
│   App.tsx  →  10 hooks (state + handlers)  →  ~18 presentational      │
│   components                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

`sandbox: false` on the `BrowserWindow` (see `main/index.ts` `createWindow()`) — the preload
script needs full Node integration to build the typed `contextBridge` API; the renderer itself
never gets direct Node/Electron access, only what `window.api` exposes.

---

## Directory Layout

```
sieve/
├── src/
│   ├── main/                       # Electron main process (Node context)
│   │   ├── index.ts                 # app lifecycle, BrowserWindow, all ipcMain.handle wiring
│   │   ├── db.ts                     # SQLite schema + all queries (see Database section)
│   │   ├── fileOps.ts                 # rename/move/copy/duplicate/delete/trash, FileOpError
│   │   ├── paths.ts                    # getExtension(), TRASH_DIR_NAME constant
│   │   ├── settings.ts                  # appConfig.json load/save/export/import
│   │   ├── thumbnails.ts                 # ThumbnailJob building, cache path hashing
│   │   ├── scanner-worker.ts             # worker_thread: recursive directory walk
│   │   ├── thumbnail-worker.ts           # worker_thread: ffmpeg frame extraction
│   │   ├── word-frequency-worker.ts      # worker_thread: filename tokenizing + counting
│   │   └── __tests__/                    # db, fileOps, paths, settings tests
│   │
│   ├── preload/
│   │   └── index.ts                # contextBridge API surface (the only main<->renderer bridge)
│   │
│   ├── shared/                     # imported by BOTH main and renderer (no Electron/DOM APIs)
│   │   ├── types.ts                 # every IPC payload/params/result type, AppSettings, SavedView
│   │   ├── media.ts                  # getMediaKind() / getMediaExtensions() - image vs video by ext
│   │   ├── tokenize.ts                # tokenizeFileName() - shared by word-frequency-worker AND
│   │   │                              #   the renderer's own match-hint tokenizing (App.tsx)
│   │   └── __tests__/
│   │
│   └── renderer/src/               # React app (browser-like context, no direct Node access)
│       ├── App.tsx                  # orchestrator: scan/query/sort/filter/group state + wiring
│       ├── constants.ts              # theme tokens, column widths, sort columns, filter presets
│       ├── types.ts                   # renderer-only types (StackEntry, GalleryEntry, PreviewSlot, FileAction)
│       ├── pathUtils.ts                # basenameFallback, dirnameFallback, formatBytes, describeFileAction
│       ├── fileDisplay.tsx              # file-type icons, extension groups, thumbnail-icon hook
│       ├── hooks/                    # one hook per concern - see Renderer State section
│       ├── components/                # presentational components - see Renderer Components section
│       └── __tests__/                 # App.test.tsx (characterization tests, see local-testing.md)
│
├── docs/                            # this file + local-testing/PACKAGING/TROUBLESHOOTING/FUTURE_UPDATES
├── electron.vite.config.ts          # build config - separate entry points per worker (see below)
├── vitest.config.ts
├── .nvmrc                           # 22.22.2 - see TROUBLESHOOTING.md
└── package.json                     # scripts + electron-builder "build" config (see PACKAGING.md)
```

---

## IPC Surface

Every call crosses the `contextBridge` as `window.api.<method>()`. Request/response calls use
`ipcMain.handle`/`ipcRenderer.invoke` (typed in both directions via `src/shared/types.ts`);
main→renderer push events use `ipcRenderer.on` wrapped in a `(callback) => unsubscribe` helper
so the renderer can clean up listeners in a `useEffect` return.

**Request/response** (`preload/index.ts` method → `main/index.ts` channel):

| Method | Channel | Purpose |
|---|---|---|
| `pickRoot()` | `dialog:pickRoot` | Native folder picker |
| `startScan(rootPath)` | `scan:start` | Kick off `scanner-worker.ts` for a root |
| `cancelScan()` | `scan:cancel` | Terminate the active scan worker |
| `getIndexHealth(rootPath)` | `index:health` | File count, DB size on disk, last scan time, watcher status |
| `queryListing(params)` | `listing:query` | Paginated, sorted, filtered rows + total count |
| `queryAllMatching(params)` | `listing:queryAll` | Same query, no pagination (used for grouping) |
| `previewFilterCount(params)` | `filter:previewCount` | Live "N would match" while typing a filter pattern |
| `getListingAggregate(params)` | `listing:aggregate` | Count + total size for the current scope/filters |
| `getStorageBreakdown(params)` | `listing:storageBreakdown` | Per-extension count/size, for the storage panel |
| `recordPattern(pattern, mode)` | `filter:recordPattern` | Log a used filter pattern to history |
| `getPatternHistory(limit)` | `filter:getPatternHistory` | Recent filter patterns |
| `analyzeWords(params)` | `words:analyze` | Tokenize+count all names in scope (via worker) |
| `getThumbnails(path)` | `thumbnails:get` | All frames for the preview carousel, as data URLs |
| `getThumbnailIcon(path)` | `thumbnails:getIcon` | First frame only, for the row icon |
| `getOriginalMedia(path)` | `media:getOriginal` | Full-res data URL for animatable formats (GIF) |
| `newFolder(parentDir)` | `fs:newFolder` | Create "New Folder", auto-uniquified |
| `renamePath(path, newName)` | `fs:rename` | Single rename |
| `bulkRename(paths, baseName)` | `fs:bulkRename` | Explorer-style `base`, `base (2)`, `base (3)`... |
| `movePaths(paths, destDir)` | `fs:move` | Move (rename, or copy+delete across devices/EXDEV) |
| `copyPaths(paths, destDir)` | `fs:copy` | Copy |
| `duplicatePaths(paths)` | `fs:duplicate` | Copy in place as `name (copy)`, `name (copy 2)`... |
| `removePaths(paths)` | `fs:remove` | **Undo-only** hard delete (undoing New Folder/Copy/Duplicate) |
| `deletePaths(rootPath, paths)` | `fs:delete` | Soft delete → same-volume trash folder |
| `emptyTrash(rootPath)` | `fs:emptyTrash` | Permanently remove the trash folder |
| `getTrashCount(rootPath)` | `fs:trashCount` | Item count in trash, for the toolbar badge |
| `getSettings()` | `settings:get` | Load `appConfig.json` (merged onto defaults) |
| `updateSettings(partial)` | `settings:update` | Field-by-field merge + persist |
| `exportConfig()` | `settings:export` | Save-dialog + write current settings to a chosen file |
| `importConfig()` | `settings:import` | Open-dialog + merge a chosen file's settings in |
| `revealInFolder(path)` | `fs:revealInFolder` | OS "show in folder" |
| `openPath(path)` | `fs:openPath` | OS "open with default app" |
| `copyPathsToClipboard(paths)` | `fs:copyPathsToClipboard` | Newline-joined paths to the OS clipboard |

**Push events** (main → renderer, via `mainWindow.webContents.send`):

| Event | Payload | Fired when |
|---|---|---|
| `scan:progress` | `{ rootPath, scanned }` | Scanner worker flushes a batch |
| `scan:done` | `{ rootPath, total, cancelled }` | Scan finishes or is cancelled |
| `scan:error` | `{ rootPath, error }` | Scanner worker throws |
| `watch:changed` | `{ rootPath }` | chokidar sees any fs event under the watched root |
| `thumbnails:progress` | `{ rootPath, processed, total }` | A thumbnail batch run advances |
| `thumbnails:done` | `{ rootPath }` | All thumbnail workers in the current run finish |
| `thumbnails:fileReady` | `{ path }` | One file's thumbnail frames just finished writing |

---

## Database (`src/main/db.ts`)

`node:sqlite`'s `DatabaseSync` — Node's **built-in** SQLite binding (Node 22+, still marked
experimental — hence the `ExperimentalWarning` in test output), not a compiled native addon.
This matters for packaging: there's no `electron-rebuild` step needed for the DB layer, only for
`ffmpeg-static`/`ffprobe-static`'s prebuilt binaries (see [PACKAGING.md](PACKAGING.md)).

DB file lives at `app.getPath('userData')/sieve-index.db` — the OS per-user app-data folder,
*not* the portable `appConfig.json` location (that distinction is deliberate: the index is a
disposable cache that can be rebuilt with a rescan; `appConfig.json` is the thing a user actually
wants to carry between machines — see the Settings section below).

```sql
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parentDir TEXT NOT NULL,
  ext TEXT NOT NULL,
  size INTEGER NOT NULL,
  ctimeMs REAL NOT NULL,
  mtimeMs REAL NOT NULL,
  isDirectory INTEGER NOT NULL,
  rootPath TEXT NOT NULL,      -- which scanned root this row belongs to
  lastSeenAt INTEGER NOT NULL  -- scan-run timestamp; used to prune stale rows after a rescan
);
-- + indexes on rootPath, name, size, mtimeMs, ctimeMs

CREATE TABLE pattern_history (
  pattern TEXT NOT NULL,
  mode TEXT NOT NULL,           -- 'fuzzy' | 'strict'
  lastUsedAt INTEGER NOT NULL,
  PRIMARY KEY (pattern, mode)
);

CREATE TABLE thumbnails (
  path TEXT NOT NULL,
  frameIndex INTEGER NOT NULL,
  mtimeMs REAL NOT NULL,        -- staleness check: regenerate if the file's mtime moved on
  thumbPath TEXT NOT NULL,      -- absolute path into userData/thumbnails/
  PRIMARY KEY (path, frameIndex)
);
```

**Custom SQL function**: `regex_match(pattern, mode, value)` is registered on the connection
(`db.function(...)`) so filter rules compile to plain SQL predicates rather than pulling every
row into JS to filter. Compiled `RegExp` objects are cached in-process (`regexCache`) keyed by
`mode:pattern`, since the same pattern gets re-evaluated on every row of every query. `fuzzy`
mode escapes the pattern as a literal substring (case-insensitive); `strict` mode compiles it as
a real regex — an invalid strict pattern just caches `null` and matches nothing, rather than
throwing mid-query.

**Filter combination** (`filterClause`): rules combine left-to-right with each rule's own
`combinator` (`AND`/`OR`), e.g. three rules produce `((r1) AND (r2)) OR (r3)` — not a single
uniform operator across all rules. `invert` flips a rule's own `regex_match(...) = 1` to `= 0`.

**Scan lifecycle**: `upsertEntries()` runs the whole batch in one `BEGIN`/`COMMIT` transaction
(one `INSERT ... ON CONFLICT DO UPDATE` per row) for speed; `deleteStale()` removes every row
under that `rootPath` whose `lastSeenAt` doesn't match the just-finished scan's timestamp — this
is what makes a Rescan converge to the current filesystem state even if files were deleted
outside the app while unwatched.

**Watcher writes bypass the batch path**: `handleWatchEvent()` in `index.ts` calls `upsertEntry`
(single row) or `deletePathAndDescendants` directly for each chokidar event — not through the
scanner worker — so a live edit shows up in the DB (and hence the UI, via the `watch:changed`
push event) without waiting for a full rescan.

---

## Worker Threads

All three run in `node:worker_threads`, spawned with `new Worker(join(__dirname,
'<name>-worker.js'), { workerData })` from `main/index.ts`, and are **deliberately Electron-API-free**
— none of them `import 'electron'`. Anything that needs `app.getPath(...)` (settings-driven
config, output paths) is resolved in the main thread and passed in via `workerData`, so these
files stay pure Node and are trivially testable/reusable outside Electron.

| Worker | Input (`workerData`) | Output (`postMessage`) | Notes |
|---|---|---|---|
| `scanner-worker.ts` | `{ rootPath }` | `{ type: 'batch', entries }` repeatedly (500-row batches), then `{ type: 'done', total }` or `{ type: 'error' }` | Iterative stack-based walk (not recursive function calls) so it doesn't blow the call stack on a deep tree; skips the trash directory |
| `thumbnail-worker.ts` | `{ jobs: ThumbnailJob[] }` | `{ type: 'result', path, mtimeMs, frames }` per job, then `{ type: 'done' }` | Spawned as N parallel workers (`performance.workerConcurrency` setting) each processing its own chunk sequentially — see `startThumbnailGeneration()` in `index.ts` |
| `word-frequency-worker.ts` | `{ names: string[] }` | `{ words: WordFrequencyEntry[] }` (single message) | Tokenizes every name via `shared/tokenize.ts`, returns the top 50 by count |

**Thumbnail generation pipeline**: `buildThumbnailJob()` (thumbnails.ts, main thread) decides
image (1 frame) vs video (`settings.thumbnails.videoFrameCount` frames, evenly spaced, clamped
0.3s before the true end to avoid a common "seek past last decodable frame" empty-output case)
and precomputes every output path via a SHA-1 hash of the file's own path
(`getThumbnailPath()`). The worker itself (`thumbnail-worker.ts`) shells out to `ffmpeg`/`ffprobe`
via `fluent-ffmpeg`, using `ffmpeg-static`/`ffprobe-static` for the binaries —
`resolveBinaryPath()` rewrites `app.asar` → `app.asar.unpacked` in the resolved binary path
since a packaged Electron app can't execute a binary that lives inside the `asar` archive (see
[PACKAGING.md](PACKAGING.md)). ffmpeg can report success (`exit 0`) while having written an
empty file in some seek-on-a-static-image edge cases — every extraction verifies the output
file's size is nonzero before resolving, never trusting the `end` event alone.

**Concurrency model**: the scanner and word-frequency workers run one job as one worker,
resolved with a single message or a stream of batches. Thumbnail generation instead splits its
job list across multiple parallel workers — mainly to keep one slow video's probe/seek from
stalling the entire queue behind it, since each worker already lets `ffmpeg` use every core it
wants for its own job.

---

## Settings (`src/main/settings.ts`)

**"Portable app" pattern, deliberately**: `appConfig.json` is stored *next to the running
executable* (`dirname(process.execPath)` when packaged), not in the OS per-user app-data folder
— so the whole app (binary + its own config) can be copied or moved as one unit, matching how a
portable Windows `.exe` is typically distributed. In dev (unpackaged, no real executable to sit
beside), it falls back to `<project root>/src/appConfig.json`.

```ts
function getSettingsPath(): string {
  if (app.isPackaged) return join(dirname(process.execPath), 'appConfig.json')
  return join(__dirname, '../../src/appConfig.json')
}
```

This is *why* the packaging config in `package.json` targets a portable zip rather than an
installer — see [PACKAGING.md](PACKAGING.md) for the full reasoning and the one platform-specific
caveat (macOS bundle-relative paths).

`loadSettings()` merges the on-disk JSON onto `DEFAULT_SETTINGS` field-by-field (not a shallow
top-level spread), so a config file written by an older version of the app — missing a field
this version added — still gets a usable default for that field instead of `undefined`.
`saveSettings(partial)` does the same merge in reverse and writes the result back out; in-process
`cached` avoids re-reading the file on every `settings:get` call.

Export/import (`exportSettingsToFile`/`importSettingsFromFile`) round-trip the *whole*
`AppSettings` object (including `savedViews`) through a user-chosen file — **except** pattern
history, which lives in SQLite (`db.ts`), not `appConfig.json`, and isn't part of this round trip.

---

## Renderer

### App.tsx — orchestrator state

After the [Phase H decomposition](../CurrentSession/397c5fc6-019b-4d6a-9393-e2adbeeedfbf.md)
(2,947 → 934 lines), `App.tsx` owns only the state that's either the app's core
scan/query/sort/filter/grouping-trigger orchestration, or too entangled with everything else to
extract without diminishing returns (a deliberate, user-confirmed scope decision — see that
changelog entry): `rootPath`, `viewMode`/`displayMode`, `pathStack` (breadcrumb trail), the
current page of `rows`/`total`/`scanned`/`scanning`/`error`, `health`, `sortField`/`sortDir`,
`filterRules` + their draft-editing fields, the quick-filter preset selections (→ memoized into
`quickFilters`), `patternHistory`, `aggregate`, and `contextMenu`. Everything else lives in a
hook or a presentational component.

### Hooks (`src/renderer/src/hooks/`)

Each owns one concern's state + handlers, returns a typed result object `App.tsx` destructures:

| Hook | Owns |
|---|---|
| `useSettings` | Settings panel state, load/theme-sync effects, export/import handlers |
| `useColumnLayout` | Table column widths + drag-to-resize |
| `usePinned` | Pinned-rows set, pin/unpin/select/clear handlers |
| `useStorageBreakdown` | Storage panel open state + its scoped fetch effect |
| `useSavedViews` | Saved-view panel/draft state + open/cancel/commit/load/delete |
| `usePreview` | Preview-carousel slots, lightbox URL, thumbnail progress, carousel nav |
| `useSelection` | Selected rows (with manual double-click-to-activate detection) |
| `useFileOps` | The big one — rename/bulk-rename/new-folder/cut-copy-paste/duplicate/drag-drop/delete/empty-trash/undo-redo, ~25 handlers |
| `useGrouping` | Word-frequency analysis, selected group words, grouped-row buckets |

Two recurring extraction patterns worth knowing if you're adding a hook:

- **Explicit params, not implicit closures**: a hook that needs something computed elsewhere
  (e.g. `useStorageBreakdown(buildScope, currentDir, filterRules, quickFilters)`) takes it as an
  argument rather than reaching into `App.tsx`'s scope.
- **`useRef`-captured callbacks for forward references**: when a hook's effect needs to call a
  handler defined *later* in `App.tsx` (e.g. `useSelection`'s `onActivateRow` eventually calling
  `handleRowActivate`, which is declared much further down), the callback is captured in a ref
  updated every render and invoked only when actually triggered — never referenced directly in a
  `useEffect` dependency array, which would be a real TypeScript TDZ error (referencing a
  not-yet-declared `const`), not just a lint nit.

### Components (`src/renderer/src/components/`)

All presentational — take only the props they need, name callbacks by what they do (`onCut`,
`onDeleteClick`) rather than passing a whole handler bag:

- **Modals**: `SettingsModal`, `BulkRenameModal`, `SaveViewModal`, `ConfirmDialogModal`
- **Menus/toolbar**: `RowContextMenu`, `Toolbar` (composes `PinnedPopover`, `SavedViewsPopover`,
  `StoragePopover`)
- **Filter/grouping bar**: `QuickFilterChips`, `FilterRuleBuilder`, `GroupingBar`
- **Small leaves**: `Breadcrumbs`, `StatusBar`, `ErrorToast`, `Lightbox`
- **Preview**: `PreviewPanel` (selection aggregate, match hints, single/dual preview cards with
  carousel controls)
- **Main content**: `FileListViews.tsx` exports `GalleryListView`/`GroupedListView`/
  `TableListView` — the three `displayMode`/`groupWords` render branches, kept in one file since
  they share the same row-interaction props (selection, drag-drop, pinning, context menu, inline
  rename) almost entirely

---

## Key Dependencies

| Package | Purpose |
|---|---|
| `electron` | Desktop shell |
| `electron-vite` | Build tooling (separate main/preload/renderer bundles, dev HMR) |
| `react` / `react-dom` | Renderer UI |
| `@mantine/core` / `@mantine/hooks` | UI component library |
| `@tabler/icons-react` | Icon set |
| `react-virtuoso` | Virtualized Table/Grouped/Gallery list rendering |
| `chokidar` | Filesystem watcher keeping the DB live between scans |
| `fluent-ffmpeg` + `ffmpeg-static` + `ffprobe-static` | Thumbnail frame extraction |
| `node:sqlite` (built-in) | The file index — not an npm dependency |

## Build Tooling

`electron.vite.config.ts` declares **four** separate entry points for the main bundle (`index`,
`scanner-worker`, `word-frequency-worker`, `thumbnail-worker`) — each worker is its own compiled
output file under `out/main/`, loaded at runtime via `new Worker(join(__dirname,
'<name>-worker.js'))`. `externalizeDepsPlugin()` on both main and preload means their npm
dependencies (`chokidar`, `fluent-ffmpeg`, `ffmpeg-static`, `ffprobe-static`) are **not** bundled
— they stay as real `node_modules` entries, which is why packaging needs `asarUnpack` for the two
binary packages rather than relying on esbuild/rollup to have inlined them (see
[PACKAGING.md](PACKAGING.md)).
