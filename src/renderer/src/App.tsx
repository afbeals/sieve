import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Checkbox,
  Group,
  Loader,
  Menu,
  Popover,
  SegmentedControl,
  Select,
  Text,
  TextInput
} from '@mantine/core'
import {
  GroupedVirtuoso,
  TableVirtuoso,
  VirtuosoGrid,
  type GridItemProps,
  type GroupedVirtuosoHandle,
  type TableVirtuosoHandle,
  type VirtuosoGridHandle
} from 'react-virtuoso'
import { IconChartBar, IconPin, IconSettings, IconX } from '@tabler/icons-react'
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
import { DATE_PRESETS, DEFAULT_COLUMN_WIDTHS, PAGE_SIZE, SIZE_PRESETS, SORT_COLUMNS, theme } from './constants'
import { EXTENSION_GROUPS, FileTypeIcon, RowIcon, getTypeLabel } from './fileDisplay'
import { BulkRenameModal } from './components/BulkRenameModal'
import { ConfirmDialogModal } from './components/ConfirmDialogModal'
import { SaveViewModal } from './components/SaveViewModal'
import { SettingsModal } from './components/SettingsModal'
import { basenameFallback, describeFileAction, formatBytes } from './pathUtils'
import type { GalleryEntry, PreviewSlot, StackEntry } from './types'
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

  function renderPreviewCard(slot: PreviewSlot, slotIndex: number, cardWidth: number): React.JSX.Element {
    const { row, frames, animatedUrl, carouselIndex } = slot
    return (
      <div key={row.path} style={{ width: cardWidth, flexShrink: 0 }}>
        {/* Fixed 2-line height (not just wordBreak) so a long name doesn't push this card's
            image lower than the other card's in the 2-file side-by-side compare view - both
            titles reserve the same vertical space regardless of how many lines they actually
            need, clamped with an ellipsis if a name would need a 3rd line. */}
        <div
          style={{
            fontWeight: 600,
            marginBottom: 8,
            wordBreak: 'break-word',
            lineHeight: '16px',
            height: 32,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical'
          }}
        >
          {row.name}
        </div>
        {frames.length === 0 ? (
          <div
            style={{
              width: '100%',
              aspectRatio: '1',
              background: theme.headerBg,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              borderRadius: 6
            }}
          >
            <FileTypeIcon row={row} size={48} />
            {!row.isDirectory && <span style={{ color: theme.muted }}>No preview available</span>}
          </div>
        ) : (
          <>
            <div
              onClick={() => setLightboxUrl(animatedUrl ?? frames[carouselIndex].dataUrl)}
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '1',
                background: theme.headerBg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                overflow: 'hidden',
                cursor: 'zoom-in'
              }}
            >
              <img
                src={animatedUrl ?? frames[carouselIndex].dataUrl}
                alt={row.name}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
              {!animatedUrl && frames.length > 1 && (
                <>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCarouselPrev(slotIndex)
                    }}
                    style={{
                      position: 'absolute',
                      left: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      cursor: 'pointer'
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      handleCarouselNext(slotIndex)
                    }}
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      border: 'none',
                      borderRadius: '50%',
                      width: 24,
                      height: 24,
                      cursor: 'pointer'
                    }}
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            {!animatedUrl && frames.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                {frames.map((frame, index) => (
                  <button
                    key={frame.frameIndex}
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSetCarouselIndex(slotIndex, index)
                    }}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      background: index === carouselIndex ? theme.accent : theme.chipBorder
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
        <div
          style={{
            marginTop: 10,
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            rowGap: 4,
            columnGap: 12,
            color: theme.fg
          }}
        >
          <span style={{ color: theme.muted }}>Type</span>
          <span style={{ textAlign: 'right' }}>{getTypeLabel(row)}</span>
          {!row.isDirectory && (
            <>
              <span style={{ color: theme.muted }}>Size</span>
              <span style={{ textAlign: 'right' }}>{formatBytes(row.size)}</span>
            </>
          )}
          <span style={{ color: theme.muted }}>Modified</span>
          <span style={{ textAlign: 'right' }}>{new Date(row.mtimeMs).toLocaleString()}</span>
          <span style={{ color: theme.muted }}>Created</span>
          <span style={{ textAlign: 'right' }}>{new Date(row.ctimeMs).toLocaleString()}</span>
          {/* Path spans both columns and stays left-aligned - it's long wrapping text, not a
              short value, so right-aligning it like the other fields would read as ragged/odd. */}
          <span style={{ color: theme.muted, gridColumn: '1 / -1', marginTop: 4 }}>Path</span>
          <span style={{ gridColumn: '1 / -1', wordBreak: 'break-all' }}>{row.path}</span>
        </div>
      </div>
    )
  }

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
      <Group
        gap="sm"
        wrap="wrap"
        style={{ padding: 12, borderBottom: `1px solid ${theme.border}` }}
      >
        <Button variant="default" size="sm" onClick={handlePickRoot}>
          Choose folder…
        </Button>
        <Checkbox
          label="Show entire subtree"
          checked={viewMode === 'recursive'}
          onChange={(event) => setViewMode(event.currentTarget.checked ? 'recursive' : 'folder')}
        />
        <SegmentedControl
          size="sm"
          value={displayMode}
          onChange={(value) => setDisplayMode(value as 'table' | 'gallery')}
          data={[
            { label: 'Table', value: 'table' },
            { label: 'Gallery', value: 'gallery' }
          ]}
        />
        {rootPath && !scanning && (
          <Button variant="default" size="sm" onClick={handleRescan}>
            Rescan
          </Button>
        )}
        {rootPath && currentDir && !scanning && (
          <Button variant="default" size="sm" onClick={handleNewFolder}>
            New Folder
          </Button>
        )}
        {rootPath && currentDir && !scanning && fileClipboard && (
          <Button variant="default" size="sm" onClick={() => void handlePaste(currentDir)}>
            Paste {fileClipboard.paths.length} item{fileClipboard.paths.length === 1 ? '' : 's'}
          </Button>
        )}
        {rootPath && !scanning && (
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleUndo()}
            disabled={undoStack.length === 0}
            title={undoStack.length > 0 ? `Undo ${describeFileAction(undoStack[undoStack.length - 1])}` : undefined}
          >
            Undo
          </Button>
        )}
        {rootPath && !scanning && (
          <Button
            variant="default"
            size="sm"
            onClick={() => void handleRedo()}
            disabled={redoStack.length === 0}
            title={redoStack.length > 0 ? `Redo ${describeFileAction(redoStack[redoStack.length - 1])}` : undefined}
          >
            Redo
          </Button>
        )}
        {rootPath && !scanning && selectedRows.length > 0 && (
          <Button variant="light" color="red" size="sm" onClick={() => handleDeleteClick()}>
            Delete {selectedRows.length} item{selectedRows.length === 1 ? '' : 's'}
          </Button>
        )}
        {rootPath && !scanning && trashCount > 0 && (
          <Button variant="default" size="sm" onClick={handleEmptyTrashClick}>
            Empty Trash ({trashCount})
          </Button>
        )}
        {rootPath && (
          <Popover opened={pinnedPanelOpen} onChange={setPinnedPanelOpen} position="bottom-end" width={300} shadow="md">
            <Popover.Target>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconPin size={14} />}
                disabled={pinnedRows.size === 0}
                onClick={() => setPinnedPanelOpen((prev) => !prev)}
              >
                Pinned ({pinnedRows.size})
              </Button>
            </Popover.Target>
            <Popover.Dropdown p={0} style={{ maxHeight: 400, display: 'flex', flexDirection: 'column', fontSize: 13 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderBottom: `1px solid ${theme.border}`,
                  fontWeight: 600
                }}
              >
                <span>Pinned ({pinnedRows.size})</span>
                <button onClick={handleClearPinned} style={{ fontSize: 12, fontWeight: 400 }}>
                  Clear all
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {Array.from(pinnedRows.values()).map((row) => (
                  <div
                    key={row.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderBottom: `1px solid ${theme.border}`
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <FileTypeIcon row={row} size={14} />
                      {row.name}
                    </span>
                    <button onClick={() => handleUnpin(row.path)} style={{ display: 'flex' }}>
                      <IconX size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${theme.border}` }}>
                <button onClick={handleSelectPinned} style={{ width: '100%' }}>
                  Select All Pinned
                </button>
              </div>
            </Popover.Dropdown>
          </Popover>
        )}
        {rootPath && settings && (
          <Popover
            opened={savedViewsPanelOpen}
            onChange={setSavedViewsPanelOpen}
            position="bottom-end"
            width={300}
            shadow="md"
          >
            <Popover.Target>
              <Button variant="default" size="sm" onClick={() => setSavedViewsPanelOpen((prev) => !prev)}>
                Views ({settings.savedViews.length})
              </Button>
            </Popover.Target>
            <Popover.Dropdown p={0} style={{ maxHeight: 400, display: 'flex', flexDirection: 'column', fontSize: 13 }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${theme.border}`,
                  fontWeight: 600
                }}
              >
                <span>Saved Views ({settings.savedViews.length})</span>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {settings.savedViews.length === 0 && (
                  <div style={{ padding: '10px 12px', color: theme.muted }}>No saved views yet.</div>
                )}
                {settings.savedViews.map((view) => (
                  <div
                    key={view.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderBottom: `1px solid ${theme.border}`
                    }}
                  >
                    <button
                      onClick={() => handleLoadView(view)}
                      style={{
                        flex: 1,
                        textAlign: 'left',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {view.name}
                    </button>
                    <button onClick={() => void handleDeleteView(view.id)} style={{ display: 'flex' }}>
                      <IconX size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div style={{ padding: '8px 12px', borderTop: `1px solid ${theme.border}` }}>
                <button onClick={handleOpenSaveView} style={{ width: '100%' }}>
                  Save current view…
                </button>
              </div>
            </Popover.Dropdown>
          </Popover>
        )}
        {rootPath && (
          <Popover opened={storagePanelOpen} onChange={setStoragePanelOpen} position="bottom-end" width={320} shadow="md">
            <Popover.Target>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconChartBar size={14} />}
                onClick={() => setStoragePanelOpen((prev) => !prev)}
              >
                Storage
              </Button>
            </Popover.Target>
            <Popover.Dropdown p={0} style={{ maxHeight: 400, display: 'flex', flexDirection: 'column', fontSize: 13 }}>
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: `1px solid ${theme.border}`,
                  fontWeight: 600
                }}
              >
                Storage by extension
              </div>
              <div style={{ overflowY: 'auto', flex: 1, padding: '8px 12px' }}>
                {storageBreakdown.length === 0 && <div style={{ color: theme.muted }}>No files in view.</div>}
                {storageBreakdown.map((entry) => {
                  const maxBytes = storageBreakdown[0]?.totalSizeBytes || 1
                  const barPercent = (entry.totalSizeBytes / maxBytes) * 100
                  return (
                    <div key={entry.ext || '(none)'} style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span>
                          {entry.ext ? `.${entry.ext}` : '(no extension)'} · {entry.count.toLocaleString()}
                        </span>
                        <span>{formatBytes(entry.totalSizeBytes)}</span>
                      </div>
                      <div style={{ background: theme.headerBg, borderRadius: 3, height: 8 }}>
                        <div
                          style={{
                            background: theme.accent,
                            borderRadius: 3,
                            height: 8,
                            width: `${barPercent}%`
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Popover.Dropdown>
          </Popover>
        )}
        <Button
          variant="default"
          size="sm"
          leftSection={<IconSettings size={14} />}
          onClick={handleOpenSettings}
          style={{ marginLeft: 'auto' }}
        >
          Settings
        </Button>
        {scanning && (
          <Button variant="default" size="sm" onClick={handleCancelScan}>
            Cancel
          </Button>
        )}
        {scanning && <Text size="sm">Scanning… {scanned} found</Text>}
        {!scanning && rootPath && !error && <Text size="sm">{total} items</Text>}
        {error && <Text size="sm" c="red">Error: {error}</Text>}
        {health && !scanning && (
          <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>
            {health.fileCount.toLocaleString()} indexed · {formatBytes(health.dbSizeBytes)} cache ·{' '}
            {health.lastScanAt ? `scanned ${new Date(health.lastScanAt).toLocaleTimeString()}` : 'not scanned yet'} ·{' '}
            watcher {health.watcherActive ? 'active' : 'inactive'}
          </Text>
        )}
      </Group>
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
      {pathStack.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: `1px solid ${theme.border}` }}>
          {pathStack.map((entry, index) => (
            <span key={entry.path}>
              {index > 0 && <span style={{ margin: '0 4px' }}>/</span>}
              <button
                style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
                disabled={index === pathStack.length - 1}
                onClick={() => handleBreadcrumbClick(index)}
              >
                {entry.label}
              </button>
            </span>
          ))}
        </div>
      )}
      <div
        style={{
          padding: '6px 12px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          gap: 6,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: 12
        }}
      >
        <span style={{ color: theme.muted }}>Quick filters:</span>
        {EXTENSION_GROUPS.map((group) => (
          <button
            key={group.label}
            onClick={() => toggleExtensionGroup(group.label)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              border: `1px solid ${theme.chipBorder}`,
              borderRadius: 12,
              padding: '2px 8px',
              cursor: 'pointer',
              background: activeExtensionGroups.has(group.label) ? theme.accent : theme.chipBg,
              color: activeExtensionGroups.has(group.label) ? theme.accentText : theme.fg
            }}
          >
            <group.icon size={13} />
            {group.label}
          </button>
        ))}
        {SIZE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => toggleSizePreset(preset.label)}
            style={{
              border: `1px solid ${theme.chipBorder}`,
              borderRadius: 12,
              padding: '2px 8px',
              cursor: 'pointer',
              background: activeSizePreset === preset.label ? theme.accent : theme.chipBg,
              color: activeSizePreset === preset.label ? theme.accentText : theme.fg
            }}
          >
            {preset.label}
          </button>
        ))}
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => toggleDatePreset(preset.label)}
            style={{
              border: `1px solid ${theme.chipBorder}`,
              borderRadius: 12,
              padding: '2px 8px',
              cursor: 'pointer',
              background: activeDatePreset === preset.label ? theme.accent : theme.chipBg,
              color: activeDatePreset === preset.label ? theme.accentText : theme.fg
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        {filterRules.map((rule, index) => (
          <span
            key={rule.id}
            style={{
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              background: theme.pillBg,
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 12
            }}
          >
            {index > 0 && <strong>{rule.combinator}</strong>}
            {rule.invert && <span>NOT</span>}
            <code>{rule.pattern}</code>
            <span style={{ color: theme.muted }}>({rule.mode})</span>
            <button
              style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer' }}
              onClick={() => handleRemoveFilter(rule.id)}
            >
              <IconX size={11} />
            </button>
          </span>
        ))}
        {filterRules.length > 0 && (
          <Select
            data={[
              { value: 'AND', label: 'AND' },
              { value: 'OR', label: 'OR' }
            ]}
            value={draftCombinator}
            onChange={(value) => {
              if (value) setDraftCombinator(value as FilterCombinator)
            }}
            w={70}
            size="xs"
            allowDeselect={false}
          />
        )}
        <TextInput
          placeholder="regex pattern…"
          value={draftPattern}
          onChange={(event) => setDraftPattern(event.currentTarget.value)}
          w={180}
          size="xs"
        />
        <Select
          data={[
            { value: 'fuzzy', label: 'fuzzy' },
            { value: 'strict', label: 'strict regex' }
          ]}
          value={draftMode}
          onChange={(value) => {
            if (value) setDraftMode(value as FilterMode)
          }}
          w={130}
          size="xs"
          allowDeselect={false}
        />
        <Checkbox
          checked={draftInvert}
          onChange={(event) => setDraftInvert(event.currentTarget.checked)}
          label="NOT"
          size="xs"
        />
        <Button size="xs" variant="default" onClick={handleAddFilter} disabled={!draftPattern}>
          Add filter
        </Button>
        {draftPattern && (
          <span style={{ fontSize: 12, color: theme.muted }}>
            {previewLoading ? 'counting…' : `${previewCount ?? 0} would match`}
          </span>
        )}
      </div>
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${theme.border}`, fontSize: 12 }}>
        {/* Analyze button + selected-word tags get their own fixed row, separate from the word
            list below - previously everything shared one flex-wrap row, so the whole toolbar
            visibly shifted down every time a new word chip wrapped onto another line. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button
            variant="default"
            size="xs"
            style={{ flexShrink: 0 }}
            onClick={handleAnalyzeWords}
            disabled={analyzingWords || !rootPath}
          >
            {analyzingWords ? 'Analyzing…' : 'Analyze words'}
          </Button>
          {groupWords.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ flexShrink: 0 }}>Grouping by:</span>
              {/* Scrolls horizontally instead of wrapping - with many selected words this row
                  would otherwise grow to several lines and keep pushing the word list down. */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto', flexShrink: 1 }}>
                {groupWords.map((word) => (
                  <span
                    key={word}
                    style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    <code>{word}</code>
                    <button
                      style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: theme.fg }}
                      onClick={() => handleRemoveGroupWord(word)}
                    >
                      <IconX size={11} />
                    </button>
                  </span>
                ))}
              </div>
              {groupedLoading && <span style={{ flexShrink: 0 }}>(loading…)</span>}
            </div>
          )}
        </div>
        {wordFrequency.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 4 }}>
            {wordFrequency.map((entry) => (
              <button
                key={entry.word}
                onClick={() => handleSelectGroupWord(entry.word)}
                style={{
                  flexShrink: 0,
                  border: `1px solid ${theme.chipBorder}`,
                  borderRadius: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: groupWords.includes(entry.word) ? theme.accent : theme.chipBg,
                  color: groupWords.includes(entry.word) ? theme.accentText : theme.fg
                }}
              >
                {entry.word} ({entry.count})
              </button>
            ))}
          </div>
        )}
      </div>
      {patternHistory.length > 0 && (
        <div
          style={{
            padding: '4px 12px 8px',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 12
          }}
        >
          <span style={{ color: theme.muted }}>Recent:</span>
          {patternHistory.map((entry) => (
            <button
              key={`${entry.mode}:${entry.pattern}`}
              onClick={() => handleUseHistoryPattern(entry)}
              style={{
                border: `1px solid ${theme.chipBorder}`,
                borderRadius: 4,
                padding: '1px 6px',
                cursor: 'pointer',
                background: theme.chipBg,
                color: theme.fg
              }}
            >
              <code>{entry.pattern}</code> <span style={{ color: theme.muted }}>({entry.mode})</span>
            </button>
          ))}
        </div>
      )}
      {groupWords.length > 0 && groups.length > 0 && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 12
          }}
        >
          <span style={{ color: theme.muted }}>Jump to:</span>
          {groups.map((group, index) => (
            <button
              key={group.label}
              onClick={() => handleJumpToGroup(index)}
              style={{
                border: `1px solid ${theme.chipBorder}`,
                borderRadius: 4,
                padding: '1px 6px',
                cursor: 'pointer',
                background: theme.chipBg,
                color: theme.fg
              }}
            >
              {group.label} ({group.rows.length})
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }} onContextMenu={(event) => handleContextMenu(event, null)}>
        {displayMode === 'gallery' ? (
          <VirtuosoGrid
            ref={galleryVirtuosoRef}
            style={{ height: '100%' }}
            data={galleryData}
            endReached={groupWords.length === 0 ? handleEndReached : undefined}
            listClassName="sieve-gallery-list"
            itemClassName="sieve-gallery-item"
            components={{ Item: GalleryItem }}
            itemContent={(_index, entry) => {
              if (entry.kind === 'divider') {
                const collapsed = collapsedGroups.has(entry.label)
                return (
                  <div
                    onClick={() => handleToggleGroupCollapse(entry.label)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      cursor: 'pointer',
                      userSelect: 'none',
                      color: theme.muted,
                      fontSize: 12
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {collapsed ? '▸' : '▾'} {entry.label}
                    </span>
                    <span style={{ flex: 1, borderBottom: `1px solid ${theme.border}` }} />
                    <span style={{ whiteSpace: 'nowrap' }}>
                      {entry.count.toLocaleString()} items, {formatBytes(entry.totalSizeBytes)}
                    </span>
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        const groupRows = groups.find((g) => g.label === entry.label)?.rows ?? []
                        handleDeleteClick(groupRows)
                      }}
                      style={{ fontSize: 11, color: theme.dangerText }}
                    >
                      Delete all
                    </button>
                  </div>
                )
              }
              const row = entry.row
              const isSelected = selectedRows.some((r) => r.path === row.path)
              const isDragOver = dragOverPath === row.path
              return (
                <div
                  draggable
                  onDragStart={(event) => handleDragStartRow(event, row)}
                  onDragOver={(event) => handleDragOverRow(event, row)}
                  onDragLeave={handleDragLeaveRow}
                  onDrop={(event) => void handleDropOnRow(event, row)}
                  onClick={(event) => handleSelectRow(row, event)}
                  onContextMenu={(event) => handleContextMenu(event, row)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    padding: 10,
                    border: isDragOver
                      ? `1px solid ${theme.dragOverBorder}`
                      : isSelected
                        ? `1px solid ${theme.selectedBorder}`
                        : `1px solid ${theme.border}`,
                    background: isDragOver ? theme.dragOverBg : isSelected ? theme.selectedBg : 'transparent',
                    borderRadius: 6,
                    cursor: row.isDirectory ? 'pointer' : 'default',
                    textAlign: 'center'
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      background: theme.headerBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                      overflow: 'hidden'
                    }}
                  >
                    <RowIcon row={row} size={32} fill />
                  </div>
                  <span style={{ fontSize: 12, wordBreak: 'break-word' }}>
                    {pinnedRows.has(row.path) && <IconPin size={11} style={{ verticalAlign: 'middle' }} />}
                    {renderNameText(row)}
                  </span>
                  {!row.isDirectory && (
                    <span style={{ fontSize: 11, color: theme.muted }}>{formatBytes(row.size)}</span>
                  )}
                </div>
              )
            }}
          />
        ) : groupWords.length > 0 ? (
          <GroupedVirtuoso
            ref={groupedVirtuosoRef}
            style={{ height: '100%' }}
            groupCounts={groupCounts}
            groupContent={(index) => {
              const group = groups[index]
              const collapsed = collapsedGroups.has(group.label)
              const totalSize = group.rows.reduce((sum, row) => (row.isDirectory ? sum : sum + row.size), 0)
              return (
                <div
                  onClick={() => handleToggleGroupCollapse(group.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: theme.headerBg,
                    color: theme.fg,
                    padding: '6px 12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <span>
                    {collapsed ? '▸' : '▾'} {group.label} — {group.rows.length.toLocaleString()} items,{' '}
                    {formatBytes(totalSize)}
                  </span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation()
                      handleDeleteClick(group.rows)
                    }}
                    style={{ fontSize: 11, fontWeight: 400, color: theme.dangerText }}
                  >
                    Delete all
                  </button>
                </div>
              )
            }}
            itemContent={(index) => {
              const row = groupFlatRows[index]
              const isSelected = selectedRows.some((r) => r.path === row.path)
              const isDragOver = dragOverPath === row.path
              return (
                <div
                  draggable
                  onDragStart={(event) => handleDragStartRow(event, row)}
                  onDragOver={(event) => handleDragOverRow(event, row)}
                  onDragLeave={handleDragLeaveRow}
                  onDrop={(event) => void handleDropOnRow(event, row)}
                  style={{
                    display: 'flex',
                    padding: '4px 12px',
                    cursor: row.isDirectory ? 'pointer' : 'default',
                    background: isDragOver ? theme.dragOverBg : isSelected ? theme.selectedBg : 'transparent',
                    outline: isDragOver ? `1px solid ${theme.dragOverBorder}` : 'none'
                  }}
                  onClick={(event) => handleSelectRow(row, event)}
                  onContextMenu={(event) => handleContextMenu(event, row)}
                >
                  <span style={{ flex: 1 }}>
                    <RowIcon row={row} size={16} /> {pinnedRows.has(row.path) && <IconPin size={11} style={{ verticalAlign: 'middle' }} />}
                    {renderNameText(row)}
                  </span>
                  <span style={{ width: 100, textAlign: 'right' }}>
                    {row.isDirectory ? '' : row.size.toLocaleString()}
                  </span>
                  <span style={{ width: 180 }}>{new Date(row.mtimeMs).toLocaleString()}</span>
                  <span style={{ width: 180 }}>{new Date(row.ctimeMs).toLocaleString()}</span>
                </div>
              )
            }}
          />
        ) : (
          <TableVirtuoso
            ref={tableVirtuosoRef}
            style={{ height: '100%' }}
            data={rows}
            endReached={handleEndReached}
            components={{
              // No `width: '100%'` here on purpose: with table-layout: fixed, a table forced to
              // 100% width redistributes/stretches the declared per-column widths to fill that
              // 100%, which mutes (or reverses) a manual resize - most visibly on the largest
              // column (Name), which is exactly the "first column won't resize" symptom. Letting
              // the table size to the natural sum of its column widths instead means resizing
              // maps 1:1 to the drag distance; any leftover space just shows as gutter.
              Table: (props) => <table {...props} style={{ ...props.style, tableLayout: 'fixed' }} />
            }}
            fixedHeaderContent={() => (
              <tr style={{ background: theme.headerBg }}>
                {SORT_COLUMNS.map((column) => (
                  <th
                    key={column.field}
                    style={{
                      position: 'relative',
                      width: columnWidths[column.field] ?? DEFAULT_COLUMN_WIDTHS[column.field],
                      textAlign: column.align,
                      padding: 8,
                      cursor: 'pointer',
                      userSelect: 'none'
                    }}
                    onClick={() => handleSortClick(column.field)}
                  >
                    {column.label}
                    {sortField === column.field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    <div
                      onMouseDown={(event) => handleColumnResizeStart(column.field, event)}
                      onClick={(event) => event.stopPropagation()}
                      onMouseEnter={() => setHoveredResizeColumn(column.field)}
                      onMouseLeave={() => setHoveredResizeColumn(null)}
                      style={{
                        position: 'absolute',
                        top: 0,
                        right: -4,
                        bottom: 0,
                        width: 9,
                        cursor: 'col-resize',
                        display: 'flex',
                        justifyContent: 'center'
                      }}
                    >
                      <div
                        style={{
                          width: 2,
                          height: '100%',
                          background:
                            activeResizeColumn === column.field || hoveredResizeColumn === column.field
                              ? theme.accent
                              : theme.border
                        }}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            )}
            itemContent={(_index, row) => {
              const isSelected = selectedRows.some((r) => r.path === row.path)
              const isDragOver = dragOverPath === row.path
              const cellStyle = {
                padding: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
                background: isDragOver ? theme.dragOverBg : isSelected ? theme.selectedBg : 'transparent',
                outline: isDragOver ? `1px solid ${theme.dragOverBorder}` : 'none'
              }
              const dragProps = {
                draggable: true,
                onDragStart: (event: React.DragEvent) => handleDragStartRow(event, row),
                onDragOver: (event: React.DragEvent) => handleDragOverRow(event, row),
                onDragLeave: handleDragLeaveRow,
                onDrop: (event: React.DragEvent) => void handleDropOnRow(event, row),
                onContextMenu: (event: React.MouseEvent) => handleContextMenu(event, row)
              }
              return (
                <>
                  <td
                    {...dragProps}
                    style={{
                      ...cellStyle,
                      width: columnWidths.name ?? DEFAULT_COLUMN_WIDTHS.name,
                      cursor: row.isDirectory ? 'pointer' : 'default'
                    }}
                    onClick={(event) => handleSelectRow(row, event)}
                  >
                    <RowIcon row={row} size={16} /> {pinnedRows.has(row.path) && <IconPin size={11} style={{ verticalAlign: 'middle' }} />}
                    {renderNameText(row)}
                  </td>
                  <td
                    {...dragProps}
                    style={{ ...cellStyle, width: columnWidths.size ?? DEFAULT_COLUMN_WIDTHS.size, textAlign: 'right' }}
                    onClick={(event) => handleSelectRow(row, event)}
                  >
                    {row.isDirectory ? '' : row.size.toLocaleString()}
                  </td>
                  <td
                    {...dragProps}
                    style={{ ...cellStyle, width: columnWidths.mtimeMs ?? DEFAULT_COLUMN_WIDTHS.mtimeMs }}
                    onClick={(event) => handleSelectRow(row, event)}
                  >
                    {new Date(row.mtimeMs).toLocaleString()}
                  </td>
                  <td
                    {...dragProps}
                    style={{ ...cellStyle, width: columnWidths.ctimeMs ?? DEFAULT_COLUMN_WIDTHS.ctimeMs }}
                    onClick={(event) => handleSelectRow(row, event)}
                  >
                    {new Date(row.ctimeMs).toLocaleString()}
                  </td>
                </>
              )
            }}
          />
        )}
      </div>
      <div
        style={{
          width: selectedRows.length === 0 ? 0 : selectedRows.length === 2 ? 460 : 260,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 200ms ease',
          borderLeft: selectedRows.length > 0 ? `1px solid ${theme.border}` : 'none'
        }}
      >
        <div
          style={{
            width: selectedRows.length === 2 ? 460 : 260,
            padding: 12,
            fontSize: 12,
            boxSizing: 'border-box'
          }}
        >
          {selectionAggregate && (
            <div style={{ marginBottom: 10, fontWeight: 600, color: theme.fg }}>
              {selectionAggregate.count.toLocaleString()} selected · {formatBytes(selectionAggregate.totalSizeBytes)}
            </div>
          )}
          {matchHints.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {matchHints.map((hint) => (
                <span
                  key={hint}
                  style={{
                    background: theme.pillBg,
                    color: theme.pillText,
                    borderRadius: 4,
                    padding: '2px 6px',
                    fontSize: 11
                  }}
                >
                  {hint}
                </span>
              ))}
            </div>
          )}
          {selectedRows.length === 1 && previewSlots[0] && renderPreviewCard(previewSlots[0], 0, 260)}
          {selectedRows.length === 2 && (
            <div style={{ display: 'flex', gap: 12 }}>
              {previewSlots.map((slot, index) => renderPreviewCard(slot, index, 212))}
            </div>
          )}
        </div>
      </div>
      </div>
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out'
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        </div>
      )}
      <Menu opened={!!contextMenu} onClose={() => setContextMenu(null)} position="bottom-start" shadow="md" width={190}>
        <Menu.Target>
          <div style={{ position: 'fixed', top: contextMenu?.y ?? 0, left: contextMenu?.x ?? 0, width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          {contextMenu?.row ? (
            <>
              {selectedRows.length === 1 && (
                <Menu.Item onClick={() => handleRowActivate(contextMenu.row as FileRow)}>Open</Menu.Item>
              )}
              {selectedRows.length <= 1 ? (
                <Menu.Item onClick={() => handleStartRename(contextMenu.row as FileRow)}>Rename</Menu.Item>
              ) : (
                <Menu.Item onClick={handleStartBulkRename}>Rename {selectedRows.length} items…</Menu.Item>
              )}
              <Menu.Item onClick={() => void handleDuplicate()}>Duplicate</Menu.Item>
              <Menu.Item onClick={handleCut}>Cut</Menu.Item>
              <Menu.Item onClick={handleCopy}>Copy</Menu.Item>
              {Boolean(contextMenu.row.isDirectory) && fileClipboard && (
                <Menu.Item onClick={() => void handlePaste((contextMenu.row as FileRow).path)}>Paste here</Menu.Item>
              )}
              <Menu.Item onClick={() => void handleCopyPath()}>Copy Path{selectedRows.length > 1 ? 's' : ''}</Menu.Item>
              <Menu.Item onClick={() => void handleRevealInFolder(contextMenu.row as FileRow)}>Reveal in folder</Menu.Item>
              <Menu.Item onClick={handleTogglePinSelected}>
                {allSelectedPinned
                  ? `Unpin ${selectedRows.length > 1 ? `${selectedRows.length} items` : ''}`
                  : `Pin ${selectedRows.length > 1 ? `${selectedRows.length} items` : ''}`}
              </Menu.Item>
              <Menu.Item color="red" onClick={() => handleDeleteClick()}>
                Delete
              </Menu.Item>
            </>
          ) : (
            <>
              <Menu.Item onClick={() => void handleNewFolder()}>New Folder</Menu.Item>
              {fileClipboard && currentDir && (
                <Menu.Item onClick={() => void handlePaste(currentDir)}>
                  Paste {fileClipboard.paths.length} item{fileClipboard.paths.length === 1 ? '' : 's'}
                </Menu.Item>
              )}
            </>
          )}
        </Menu.Dropdown>
      </Menu>
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
      {fileOpError && (
        <div
          style={{
            position: 'fixed',
            bottom: 40,
            left: '50%',
            transform: 'translateX(-50%)',
            background: theme.errorBg,
            color: theme.errorText,
            border: `1px solid ${theme.errorText}`,
            borderRadius: 6,
            padding: '8px 14px',
            fontSize: 13,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 1200
          }}
        >
          {fileOpError}
          <button
            onClick={() => setFileOpError(null)}
            style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >
            <IconX size={14} />
          </button>
        </div>
      )}
      <ConfirmDialogModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
      <div
        style={{
          padding: '4px 12px',
          borderTop: `1px solid ${theme.border}`,
          fontSize: 12,
          color: theme.muted,
          background: theme.headerBg,
          display: 'flex',
          justifyContent: 'space-between'
        }}
      >
        <span>
          {aggregate
            ? `${aggregate.count.toLocaleString()} items in view · ${formatBytes(aggregate.totalSizeBytes)}`
            : '—'}
        </span>
        {backgroundStatus && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Loader size="xs" />
            {backgroundStatus}
          </span>
        )}
      </div>
    </div>
  )
}
