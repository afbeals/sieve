import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GridItemProps, GroupedVirtuosoHandle, TableVirtuosoHandle, VirtuosoGridHandle } from 'react-virtuoso'
import { tokenizeFileName } from '../../shared/tokenize'
import './gallery.css'
import type {
  FileRow,
  FilterCombinator,
  FilterMode,
  FilterRule,
  IndexHealth,
  ListingAggregate,
  ListingScope,
  PatternHistoryEntry,
  QuickFilters,
  SortDir,
  SortField
} from '../../shared/types'
import { DATE_PRESETS, DEFAULT_COLUMN_WIDTHS, PAGE_SIZE, SIZE_PRESETS, theme } from './constants'
import { EXTENSION_GROUPS } from './fileDisplay'
import { Breadcrumbs } from './components/Breadcrumbs'
import { BulkRenameModal } from './components/BulkRenameModal'
import { ConfirmDialogModal } from './components/ConfirmDialogModal'
import { ErrorToast } from './components/ErrorToast'
import { GalleryListView, GroupedListView, TableListView } from './components/FileListViews'
import { FilterRuleBuilder } from './components/FilterRuleBuilder'
import { GroupingBar } from './components/GroupingBar'
import { Lightbox } from './components/Lightbox'
import { PreviewPanel } from './components/PreviewPanel'
import { QuickFilterChips } from './components/QuickFilterChips'
import { RowContextMenu } from './components/RowContextMenu'
import { SaveViewModal } from './components/SaveViewModal'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { Toolbar } from './components/Toolbar'
import { basenameFallback } from './pathUtils'
import type { GalleryEntry, StackEntry } from './types'
import { useColumnLayout } from './hooks/useColumnLayout'
import { useFileOps } from './hooks/useFileOps'
import { useGrouping } from './hooks/useGrouping'
import { usePinned } from './hooks/usePinned'
import { usePreview } from './hooks/usePreview'
import { useSavedViews } from './hooks/useSavedViews'
import { useSelection } from './hooks/useSelection'
import { useSettings } from './hooks/useSettings'
import { useStorageBreakdown } from './hooks/useStorageBreakdown'

export default function App(): React.JSX.Element {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'recursive' | 'folder'>('recursive')
  const [displayMode, setDisplayMode] = useState<'table' | 'gallery'>('table')
  const [pathStack, setPathStack] = useState<StackEntry[]>([])
  const [rows, setRows] = useState<FileRow[]>([])
  const [total, setTotal] = useState(0)
  const [scanned, setScanned] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<IndexHealth | null>(null)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterRules, setFilterRules] = useState<FilterRule[]>([])
  const [draftPattern, setDraftPattern] = useState('')
  const [draftMode, setDraftMode] = useState<FilterMode>('fuzzy')
  const [draftInvert, setDraftInvert] = useState(false)
  const [draftCombinator, setDraftCombinator] = useState<FilterCombinator>('AND')
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [activeExtensionGroups, setActiveExtensionGroups] = useState<Set<string>>(new Set())
  const [activeSizePreset, setActiveSizePreset] = useState<string | null>(null)
  const [activeDatePreset, setActiveDatePreset] = useState<string | null>(null)
  const [patternHistory, setPatternHistory] = useState<PatternHistoryEntry[]>([])
  const [aggregate, setAggregate] = useState<ListingAggregate | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; row: FileRow | null } | null>(null)
  const loadingMore = useRef(false)
  const groupedVirtuosoRef = useRef<GroupedVirtuosoHandle>(null)
  const tableVirtuosoRef = useRef<TableVirtuosoHandle>(null)
  const galleryVirtuosoRef = useRef<VirtuosoGridHandle>(null)
  const galleryDataRef = useRef<GalleryEntry[]>([])

  const quickFilters = useMemo<QuickFilters>(() => {
    const extensions = EXTENSION_GROUPS.filter((group) => activeExtensionGroups.has(group.label)).flatMap(
      (group) => group.extensions
    )
    const sizePreset = SIZE_PRESETS.find((preset) => preset.label === activeSizePreset)
    const datePreset = DATE_PRESETS.find((preset) => preset.label === activeDatePreset)
    return {
      extensions,
      minSizeBytes: sizePreset?.minSizeBytes,
      modifiedAfterMs: datePreset ? Date.now() - datePreset.withinMs : undefined
    }
  }, [activeExtensionGroups, activeSizePreset, activeDatePreset])

  const { selectedRows, setSelectedRows, handleSelectRow, selectionAggregate } = useSelection((row) =>
    handleRowActivate(row)
  )

  const {
    columnWidths,
    setColumnWidths,
    activeResizeColumn,
    hoveredResizeColumn,
    setHoveredResizeColumn,
    handleColumnResizeStart
  } = useColumnLayout()

  const {
    pinnedRows,
    pinnedPanelOpen,
    setPinnedPanelOpen,
    allSelectedPinned,
    handleTogglePinSelected,
    handleUnpin,
    handleSelectPinned,
    handleClearPinned,
    removePinnedPaths
  } = usePinned(selectedRows, (rows) => setSelectedRows(rows), () => setContextMenu(null))

  const {
    settings,
    settingsDraft,
    settingsPanelOpen,
    settingsLoadedRef,
    setSettingsDraft,
    setSettingsPanelOpen,
    updateSettings,
    handleOpenSettings,
    handleCancelSettings,
    handleSaveSettings,
    handleExportConfig,
    handleImportConfig
  } = useSettings(
    (loaded) => {
      setSortField(loaded.defaultSortField)
      setSortDir(loaded.defaultSortDir)
      setDisplayMode(loaded.defaultViewMode)
      setColumnWidths({ ...DEFAULT_COLUMN_WIDTHS, ...loaded.columnWidths })
    },
    (message) => setFileOpError(message)
  )

  const {
    savedViewsPanelOpen,
    setSavedViewsPanelOpen,
    saveViewDraftOpen,
    saveViewNameDraft,
    setSaveViewNameDraft,
    handleOpenSaveView,
    handleCancelSaveView,
    handleCommitSaveView,
    handleLoadView,
    handleDeleteView
  } = useSavedViews(
    settings,
    updateSettings,
    () => ({
      filterRules,
      activeExtensionGroups: Array.from(activeExtensionGroups),
      activeSizePreset,
      activeDatePreset,
      sortField,
      sortDir,
      groupWords,
      displayMode,
      viewMode
    }),
    (view) => {
      setFilterRules(view.filterRules)
      setActiveExtensionGroups(new Set(view.activeExtensionGroups))
      setActiveSizePreset(view.activeSizePreset)
      setActiveDatePreset(view.activeDatePreset)
      setSortField(view.sortField)
      setSortDir(view.sortDir)
      setGroupWords(view.groupWords)
      setDisplayMode(view.displayMode)
      setViewMode(view.viewMode)
    }
  )

  // Persistent layout (#32): auto-saves whenever the user changes sort/view mode or drags a
  // column wider/narrower, independent of the manual Settings panel save. Debounced so a
  // column drag (many rapid width changes) doesn't write to disk on every pixel. Gated on
  // settingsLoadedRef so this doesn't fire (and overwrite the just-loaded file with fresh-
  // session defaults) before useSettings's initial load has actually applied.
  useEffect(() => {
    if (!settingsLoadedRef.current) return
    const timer = setTimeout(() => {
      void window.api.updateSettings({
        defaultSortField: sortField,
        defaultSortDir: sortDir,
        defaultViewMode: displayMode,
        columnWidths
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [sortField, sortDir, displayMode, columnWidths, settingsLoadedRef])

  const currentDir = pathStack[pathStack.length - 1]?.path ?? rootPath

  const buildScope = useCallback(
    (dir: string | null): ListingScope | null => (dir ? { mode: viewMode, dirPath: dir } : null),
    [viewMode]
  )

  const loadPage = useCallback(
    async (scope: ListingScope, offset: number, append: boolean): Promise<void> => {
      const result = await window.api.queryListing({
        scope,
        filterRules,
        quickFilters,
        sortField,
        sortDir,
        limit: PAGE_SIZE,
        offset
      })
      setTotal(result.total)
      setRows((prev) => (append ? [...prev, ...result.rows] : result.rows))
    },
    [sortField, sortDir, filterRules, quickFilters]
  )

  const reload = useCallback((): void => {
    const scope = buildScope(currentDir)
    if (!scope) return
    setRows([])
    void loadPage(scope, 0, false)
  }, [buildScope, currentDir, loadPage])

  const refreshHealth = useCallback(async (root: string): Promise<void> => {
    const result = await window.api.getIndexHealth(root)
    setHealth(result)
  }, [])

  const {
    groupWords,
    setGroupWords,
    groupedLoading,
    collapsedGroups,
    groups,
    groupFlatRows,
    groupCounts,
    wordFrequency,
    analyzingWords,
    handleToggleGroupCollapse,
    handleSelectGroupWord,
    handleRemoveGroupWord,
    handleAnalyzeWords
  } = useGrouping(buildScope, currentDir, filterRules, quickFilters, sortField, sortDir)

  const loadAggregate = useCallback(async (): Promise<void> => {
    const scope = buildScope(currentDir)
    if (!scope) {
      setAggregate(null)
      return
    }
    try {
      const result = await window.api.getListingAggregate({ scope, filterRules, quickFilters })
      setAggregate(result)
    } catch (err) {
      console.error('Failed to load listing aggregate', err)
    }
  }, [buildScope, currentDir, filterRules, quickFilters])

  const { storageBreakdown, storagePanelOpen, setStoragePanelOpen, loadStorageBreakdown } = useStorageBreakdown(
    buildScope,
    currentDir,
    filterRules,
    quickFilters
  )

  const {
    previewSlots,
    lightboxUrl,
    setLightboxUrl,
    thumbnailProgress,
    setThumbnailProgress,
    loadPreviewSlots,
    handleCarouselPrev,
    handleCarouselNext,
    handleSetCarouselIndex
  } = usePreview(selectedRows)

  const {
    renamingPath,
    renameDraft,
    setRenameDraft,
    bulkRenameOpen,
    bulkRenameDraft,
    setBulkRenameDraft,
    fileOpError,
    setFileOpError,
    confirmDialog,
    setConfirmDialog,
    dragOverPath,
    undoStack,
    redoStack,
    trashCount,
    refreshTrashCount,
    fileClipboard,
    handleStartRename,
    handleCancelRename,
    handleCommitRename,
    handleStartBulkRename,
    handleCancelBulkRename,
    handleCommitBulkRename,
    handleNewFolder,
    handleCut,
    handleCopy,
    handlePaste,
    handleDuplicate,
    handleCopyPath,
    handleRevealInFolder,
    handleDragStartRow,
    handleDragOverRow,
    handleDragLeaveRow,
    handleDropOnRow,
    handleDeleteClick,
    handleEmptyTrashClick,
    handleUndo,
    handleRedo,
    clearActionHistory
  } = useFileOps(rootPath, currentDir, selectedRows, setSelectedRows, reload, removePinnedPaths, () => setContextMenu(null))

  // Context menu (Menu) and the Pinned/Views/Storage panels (Popover) handle their own
  // click-outside and Escape-to-close behavior - no manual window listeners needed for them.
  useEffect(() => {
    if (!renamingPath && !bulkRenameOpen && !settingsPanelOpen && !saveViewDraftOpen) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      handleCancelRename()
      handleCancelBulkRename()
      setSettingsPanelOpen(false)
      handleCancelSaveView()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [renamingPath, bulkRenameOpen, settingsPanelOpen, saveViewDraftOpen, handleCancelRename, handleCancelBulkRename, handleCancelSaveView])

  useEffect(() => {
    void loadAggregate()
  }, [loadAggregate])

  const galleryData = useMemo<GalleryEntry[]>(() => {
    if (groupWords.length === 0) return rows.map((row) => ({ kind: 'row', row }))
    const entries: GalleryEntry[] = []
    for (const group of groups) {
      const totalSizeBytes = group.rows.reduce((sum, row) => (row.isDirectory ? sum : sum + row.size), 0)
      entries.push({ kind: 'divider', label: group.label, count: group.rows.length, totalSizeBytes })
      if (!collapsedGroups.has(group.label)) {
        for (const row of group.rows) entries.push({ kind: 'row', row })
      }
    }
    return entries
  }, [groupWords, groups, collapsedGroups, rows])
  galleryDataRef.current = galleryData

  const galleryGroupOffsets = useMemo(() => {
    if (groupWords.length === 0) return []
    const offsets: number[] = []
    let cursor = 0
    for (const group of groups) {
      offsets.push(cursor)
      cursor += 1 + (collapsedGroups.has(group.label) ? 0 : group.rows.length)
    }
    return offsets
  }, [groupWords, groups, collapsedGroups])

  const visibleOrderedRows = useMemo<FileRow[]>(() => {
    if (displayMode === 'gallery') {
      return galleryData.flatMap((entry) => (entry.kind === 'row' ? [entry.row] : []))
    }
    return groupWords.length > 0 ? groupFlatRows : rows
  }, [displayMode, galleryData, groupWords, groupFlatRows, rows])

  const scrollRowIntoView = (row: FileRow, flatIndex: number): void => {
    if (displayMode === 'gallery') {
      const galleryIndex = galleryData.findIndex((entry) => entry.kind === 'row' && entry.row.path === row.path)
      if (galleryIndex >= 0) galleryVirtuosoRef.current?.scrollToIndex({ index: galleryIndex, align: 'center' })
    } else if (groupWords.length > 0) {
      groupedVirtuosoRef.current?.scrollToIndex({ index: flatIndex, align: 'center' })
    } else {
      tableVirtuosoRef.current?.scrollToIndex({ index: flatIndex, align: 'center' })
    }
  }

  // Arrow-key navigation moves the live preview (#18): it always replaces the selection with a
  // single neighboring row (never extends a multi-select) so the preview panel has one clear
  // "current" row to follow, mirroring Finder/Explorer's arrow-key + Quick Look behavior.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (visibleOrderedRows.length === 0) return
      event.preventDefault()
      const lastSelected = selectedRows[selectedRows.length - 1]
      const currentIndex = lastSelected
        ? visibleOrderedRows.findIndex((row) => row.path === lastSelected.path)
        : -1
      const delta = event.key === 'ArrowDown' ? 1 : -1
      const nextIndex = Math.min(Math.max(currentIndex + delta, 0), visibleOrderedRows.length - 1)
      const nextRow = visibleOrderedRows[nextIndex]
      setSelectedRows([nextRow])
      scrollRowIntoView(nextRow, nextIndex)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visibleOrderedRows, selectedRows, displayMode, groupWords, galleryData])

  function renderNameText(row: FileRow): React.JSX.Element {
    if (renamingPath !== row.path) return <>{row.name}</>
    return (
      <input
        autoFocus
        value={renameDraft}
        onChange={(event) => setRenameDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') void handleCommitRename()
          if (event.key === 'Escape') handleCancelRename()
        }}
        onBlur={() => void handleCommitRename()}
        style={{ font: 'inherit', width: '90%' }}
      />
    )
  }

  const GalleryItem = useMemo(() => {
    function GalleryItemComponent({ children, className, style, ...rest }: GridItemProps): React.JSX.Element {
      const entry = galleryDataRef.current[rest['data-index']]
      const isDivider = entry?.kind === 'divider'
      return (
        <div {...rest} className={className} style={isDivider ? { ...style, gridColumn: '1 / -1' } : style}>
          {children}
        </div>
      )
    }
    return GalleryItemComponent
  }, [])

  const handleJumpToGroup = (groupIndex: number): void => {
    if (displayMode === 'gallery') {
      const offset = galleryGroupOffsets[groupIndex] ?? 0
      galleryVirtuosoRef.current?.scrollToIndex({ index: offset, align: 'start' })
      return
    }
    const offset = groupCounts.slice(0, groupIndex).reduce((sum, count) => sum + count, 0)
    groupedVirtuosoRef.current?.scrollToIndex({ index: offset, align: 'start' })
  }

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    const unsubscribeProgress = window.api.onScanProgress((payload) => {
      if (payload.rootPath === rootPath) setScanned(payload.scanned)
    })
    const unsubscribeDone = window.api.onScanDone((payload) => {
      if (payload.rootPath !== rootPath) return
      setScanning(false)
      reload()
      void refreshHealth(payload.rootPath)
      void refreshTrashCount(payload.rootPath)
      void loadAggregate()
      void loadStorageBreakdown()
    })
    const unsubscribeError = window.api.onScanError((payload) => {
      if (payload.rootPath !== rootPath) return
      setScanning(false)
      setError(payload.error)
    })
    const unsubscribeChanged = window.api.onWatchChanged((payload) => {
      if (payload.rootPath !== rootPath) return
      reload()
      void refreshHealth(payload.rootPath)
      void loadAggregate()
      void loadStorageBreakdown()
    })
    const unsubscribeThumbProgress = window.api.onThumbnailProgress((payload) => {
      if (payload.rootPath !== rootPath) return
      setThumbnailProgress({ processed: payload.processed, total: payload.total })
    })
    const unsubscribeThumbDone = window.api.onThumbnailDone((payload) => {
      if (payload.rootPath !== rootPath) return
      setThumbnailProgress(null)
    })
    const unsubscribeThumbReady = window.api.onThumbnailFileReady((payload) => {
      if (selectedRows.some((row) => row.path === payload.path)) void loadPreviewSlots()
    })
    return () => {
      unsubscribeProgress()
      unsubscribeDone()
      unsubscribeError()
      unsubscribeChanged()
      unsubscribeThumbProgress()
      unsubscribeThumbDone()
      unsubscribeThumbReady()
    }
  }, [
    rootPath,
    reload,
    refreshHealth,
    refreshTrashCount,
    loadAggregate,
    loadStorageBreakdown,
    selectedRows,
    loadPreviewSlots
  ])

  const handlePickRoot = async (): Promise<void> => {
    const picked = await window.api.pickRoot()
    if (!picked) return
    setError(null)
    setRootPath(picked)
    setPathStack([{ path: picked, label: basenameFallback(picked) }])
    setRows([])
    setTotal(0)
    setScanned(0)
    setHealth(null)
    setScanning(true)
    handleClearPinned()
    setSelectedRows([])
    clearActionHistory()
    await window.api.startScan(picked)
  }

  const handleRescan = async (): Promise<void> => {
    if (!rootPath || scanning) return
    setError(null)
    setScanned(0)
    setScanning(true)
    await window.api.startScan(rootPath)
  }

  const handleCancelScan = async (): Promise<void> => {
    await window.api.cancelScan()
  }

  const handleEndReached = (): void => {
    const scope = buildScope(currentDir)
    if (loadingMore.current || !scope) return
    if (rows.length >= total) return
    loadingMore.current = true
    loadPage(scope, rows.length, true).finally(() => {
      loadingMore.current = false
    })
  }

  const handleRowActivate = (row: FileRow): void => {
    if (row.isDirectory) {
      setPathStack((prev) => [...prev, { path: row.path, label: row.name }])
      return
    }
    void window.api.openPath(row.path).then((result) => {
      if (result) setFileOpError(result)
    })
  }

  // File operations only perform the raw fs mutation via IPC; they never touch `rows`/DB state
  // directly. The already-running filesystem watcher (main/index.ts) sees the same add/unlink
  // events it would for an external change and updates the index, which flows back here via
  // the existing `watch:changed` -> reload() pipeline. The explicit reload() calls below are
  // just an optimistic nudge for snappier feedback; they are not the source of truth.
  const handleContextMenu = (event: React.MouseEvent, row: FileRow | null): void => {
    event.preventDefault()
    event.stopPropagation()
    if (row && !selectedRows.some((r) => r.path === row.path)) setSelectedRows([row])
    setContextMenu({ x: event.clientX, y: event.clientY, row })
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (selectedRows.length === 0) return
      event.preventDefault()
      handleDeleteClick()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedRows, rootPath])

  const handleBreadcrumbClick = (index: number): void => {
    setPathStack((prev) => prev.slice(0, index + 1))
  }

  useEffect(() => {
    const scope = buildScope(currentDir)
    if (!scope || !draftPattern) {
      setPreviewCount(null)
      return
    }
    const draftRule: FilterRule = {
      id: 'draft',
      pattern: draftPattern,
      mode: draftMode,
      invert: draftInvert,
      combinator: draftCombinator
    }
    setPreviewLoading(true)
    const timeoutId = setTimeout(() => {
      window.api
        .previewFilterCount({ scope, filterRules: [...filterRules, draftRule], quickFilters })
        .then((count) => setPreviewCount(count))
        .catch(() => setPreviewCount(null))
        .finally(() => setPreviewLoading(false))
    }, 200)
    return () => clearTimeout(timeoutId)
  }, [draftPattern, draftMode, draftInvert, draftCombinator, filterRules, quickFilters, buildScope, currentDir])

  const refreshPatternHistory = useCallback(async (): Promise<void> => {
    const history = await window.api.getPatternHistory(10)
    setPatternHistory(history)
  }, [])

  useEffect(() => {
    void refreshPatternHistory()
  }, [refreshPatternHistory])

  const handleAddFilter = (): void => {
    if (!draftPattern) return
    const newRule: FilterRule = {
      id: crypto.randomUUID(),
      pattern: draftPattern,
      mode: draftMode,
      invert: draftInvert,
      combinator: draftCombinator
    }
    setFilterRules((prev) => [...prev, newRule])
    void window.api.recordPattern(draftPattern, draftMode).then(refreshPatternHistory)
    setDraftPattern('')
    setDraftInvert(false)
    setPreviewCount(null)
  }

  const handleRemoveFilter = (id: string): void => {
    setFilterRules((prev) => prev.filter((rule) => rule.id !== id))
  }

  const handleUseHistoryPattern = (entry: PatternHistoryEntry): void => {
    setDraftPattern(entry.pattern)
    setDraftMode(entry.mode)
  }

  const toggleExtensionGroup = (label: string): void => {
    setActiveExtensionGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }

  const toggleSizePreset = (label: string): void => {
    setActiveSizePreset((prev) => (prev === label ? null : label))
  }

  const toggleDatePreset = (label: string): void => {
    setActiveDatePreset((prev) => (prev === label ? null : label))
  }

  const matchHints = useMemo((): string[] => {
    if (selectedRows.length !== 2) return []
    const [a, b] = selectedRows
    const hints: string[] = []
    if (!a.isDirectory && !b.isDirectory && a.size === b.size) hints.push('Same size')
    const tokensA = new Set(tokenizeFileName(a.name))
    const sharedWord = tokenizeFileName(b.name).find((word) => tokensA.has(word))
    if (sharedWord) hints.push(`Shares word "${sharedWord}"`)
    return hints
  }, [selectedRows])

  const handleSortClick = (field: SortField): void => {
    if (field === sortField) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // Unified background-work indicator for the footer's bottom-right slot. Priority order for
  // when more than one happens to be running at once - thumbnails are usually the longest-
  // running and most "why is my disk churning" relevant, so they win. Scanning has its own
  // dedicated progress bar/Cancel button elsewhere and isn't duplicated here.
  const backgroundStatus: string | null = thumbnailProgress
    ? `Generating thumbnails… ${thumbnailProgress.processed.toLocaleString()}/${thumbnailProgress.total.toLocaleString()}`
    : analyzingWords
      ? 'Analyzing words…'
      : groupedLoading
        ? 'Grouping…'
        : null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'sans-serif',
        background: theme.bg,
        color: theme.fg
      }}
    >
      <Toolbar
        rootPath={rootPath}
        currentDir={currentDir}
        scanning={scanning}
        scanned={scanned}
        total={total}
        error={error}
        health={health}
        viewMode={viewMode}
        setViewMode={setViewMode}
        displayMode={displayMode}
        setDisplayMode={setDisplayMode}
        fileClipboard={fileClipboard}
        undoStack={undoStack}
        redoStack={redoStack}
        selectedCount={selectedRows.length}
        trashCount={trashCount}
        pinnedPanelOpen={pinnedPanelOpen}
        setPinnedPanelOpen={setPinnedPanelOpen}
        pinnedRows={pinnedRows}
        savedViewsPanelOpen={savedViewsPanelOpen}
        setSavedViewsPanelOpen={setSavedViewsPanelOpen}
        savedViews={settings?.savedViews ?? null}
        storagePanelOpen={storagePanelOpen}
        setStoragePanelOpen={setStoragePanelOpen}
        storageBreakdown={storageBreakdown}
        onPickRoot={() => void handlePickRoot()}
        onRescan={() => void handleRescan()}
        onCancelScan={() => void handleCancelScan()}
        onNewFolder={() => void handleNewFolder()}
        onPaste={(destDir) => void handlePaste(destDir)}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        onDeleteClick={() => handleDeleteClick()}
        onEmptyTrashClick={handleEmptyTrashClick}
        onClearPinned={handleClearPinned}
        onUnpin={handleUnpin}
        onSelectPinned={handleSelectPinned}
        onLoadView={handleLoadView}
        onDeleteView={(id) => void handleDeleteView(id)}
        onOpenSaveView={handleOpenSaveView}
        onOpenSettings={handleOpenSettings}
      />
      {scanning && (
        <div style={{ height: 3, overflow: 'hidden', background: theme.headerBg }}>
          <div
            style={{
              height: '100%',
              width: '40%',
              background: theme.accent,
              animation: 'sieve-indeterminate 1.1s ease-in-out infinite'
            }}
          />
          <style>{`
            @keyframes sieve-indeterminate {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(250%); }
            }
          `}</style>
        </div>
      )}
      <Breadcrumbs pathStack={pathStack} onBreadcrumbClick={handleBreadcrumbClick} />
      <QuickFilterChips
        activeExtensionGroups={activeExtensionGroups}
        activeSizePreset={activeSizePreset}
        activeDatePreset={activeDatePreset}
        onToggleExtensionGroup={toggleExtensionGroup}
        onToggleSizePreset={toggleSizePreset}
        onToggleDatePreset={toggleDatePreset}
      />
      <FilterRuleBuilder
        filterRules={filterRules}
        draftPattern={draftPattern}
        setDraftPattern={setDraftPattern}
        draftMode={draftMode}
        setDraftMode={setDraftMode}
        draftInvert={draftInvert}
        setDraftInvert={setDraftInvert}
        draftCombinator={draftCombinator}
        setDraftCombinator={setDraftCombinator}
        previewCount={previewCount}
        previewLoading={previewLoading}
        onAddFilter={handleAddFilter}
        onRemoveFilter={handleRemoveFilter}
      />
      <GroupingBar
        rootPath={rootPath}
        analyzingWords={analyzingWords}
        groupWords={groupWords}
        groupedLoading={groupedLoading}
        wordFrequency={wordFrequency}
        patternHistory={patternHistory}
        groups={groups}
        onAnalyzeWords={() => void handleAnalyzeWords()}
        onRemoveGroupWord={handleRemoveGroupWord}
        onSelectGroupWord={handleSelectGroupWord}
        onUseHistoryPattern={handleUseHistoryPattern}
        onJumpToGroup={handleJumpToGroup}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }} onContextMenu={(event) => handleContextMenu(event, null)}>
        {displayMode === 'gallery' ? (
          <GalleryListView
            galleryVirtuosoRef={galleryVirtuosoRef}
            galleryData={galleryData}
            groups={groups}
            endReached={groupWords.length === 0 ? handleEndReached : undefined}
            GalleryItemComponent={GalleryItem}
            collapsedGroups={collapsedGroups}
            selectedRows={selectedRows}
            dragOverPath={dragOverPath}
            pinnedRows={pinnedRows}
            renderNameText={renderNameText}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onDeleteClick={handleDeleteClick}
            onDragStartRow={handleDragStartRow}
            onDragOverRow={handleDragOverRow}
            onDragLeaveRow={handleDragLeaveRow}
            onDropOnRow={(event, row) => void handleDropOnRow(event, row)}
            onSelectRow={handleSelectRow}
            onContextMenu={handleContextMenu}
          />
        ) : groupWords.length > 0 ? (
          <GroupedListView
            groupedVirtuosoRef={groupedVirtuosoRef}
            groupCounts={groupCounts}
            groups={groups}
            groupFlatRows={groupFlatRows}
            collapsedGroups={collapsedGroups}
            selectedRows={selectedRows}
            dragOverPath={dragOverPath}
            pinnedRows={pinnedRows}
            renderNameText={renderNameText}
            onToggleGroupCollapse={handleToggleGroupCollapse}
            onDeleteClick={handleDeleteClick}
            onDragStartRow={handleDragStartRow}
            onDragOverRow={handleDragOverRow}
            onDragLeaveRow={handleDragLeaveRow}
            onDropOnRow={(event, row) => void handleDropOnRow(event, row)}
            onSelectRow={handleSelectRow}
            onContextMenu={handleContextMenu}
          />
        ) : (
          <TableListView
            tableVirtuosoRef={tableVirtuosoRef}
            rows={rows}
            endReached={handleEndReached}
            columnWidths={columnWidths}
            sortField={sortField}
            sortDir={sortDir}
            activeResizeColumn={activeResizeColumn}
            hoveredResizeColumn={hoveredResizeColumn}
            selectedRows={selectedRows}
            dragOverPath={dragOverPath}
            pinnedRows={pinnedRows}
            renderNameText={renderNameText}
            onSortClick={handleSortClick}
            onColumnResizeStart={handleColumnResizeStart}
            onHoverResizeColumn={setHoveredResizeColumn}
            onDragStartRow={handleDragStartRow}
            onDragOverRow={handleDragOverRow}
            onDragLeaveRow={handleDragLeaveRow}
            onDropOnRow={(event, row) => void handleDropOnRow(event, row)}
            onSelectRow={handleSelectRow}
            onContextMenu={handleContextMenu}
          />
        )}
      </div>
      <PreviewPanel
        selectedCount={selectedRows.length}
        selectionAggregate={selectionAggregate}
        matchHints={matchHints}
        previewSlots={previewSlots}
        onOpenLightbox={setLightboxUrl}
        onCarouselPrev={handleCarouselPrev}
        onCarouselNext={handleCarouselNext}
        onSetCarouselIndex={handleSetCarouselIndex}
      />
      </div>
      {lightboxUrl && <Lightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <RowContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        selectedCount={selectedRows.length}
        allSelectedPinned={allSelectedPinned}
        fileClipboard={fileClipboard}
        currentDir={currentDir}
        onActivateRow={handleRowActivate}
        onStartRename={handleStartRename}
        onStartBulkRename={handleStartBulkRename}
        onDuplicate={() => void handleDuplicate()}
        onCut={handleCut}
        onCopy={handleCopy}
        onPaste={(destDir) => void handlePaste(destDir)}
        onCopyPath={() => void handleCopyPath()}
        onRevealInFolder={(row) => void handleRevealInFolder(row)}
        onTogglePinSelected={handleTogglePinSelected}
        onDeleteClick={() => handleDeleteClick()}
        onNewFolder={() => void handleNewFolder()}
      />
      <BulkRenameModal
        opened={bulkRenameOpen}
        itemCount={selectedRows.length}
        draft={bulkRenameDraft}
        setDraft={setBulkRenameDraft}
        onCancel={handleCancelBulkRename}
        onCommit={() => void handleCommitBulkRename()}
      />
      <SaveViewModal
        opened={saveViewDraftOpen}
        nameDraft={saveViewNameDraft}
        setNameDraft={setSaveViewNameDraft}
        onCancel={handleCancelSaveView}
        onCommit={() => void handleCommitSaveView()}
      />
      <SettingsModal
        opened={settingsPanelOpen}
        settingsDraft={settingsDraft}
        setSettingsDraft={setSettingsDraft}
        onCancel={handleCancelSettings}
        onSave={() => void handleSaveSettings()}
        onExportConfig={() => void handleExportConfig()}
        onImportConfig={() => void handleImportConfig()}
      />
      {fileOpError && <ErrorToast message={fileOpError} onDismiss={() => setFileOpError(null)} />}
      <ConfirmDialogModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <StatusBar aggregate={aggregate} backgroundStatus={backgroundStatus} />
    </div>
  )
}
