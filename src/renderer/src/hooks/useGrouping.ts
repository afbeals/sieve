import { useCallback, useEffect, useMemo, useState } from 'react'
import { tokenizeFileName } from '../../../shared/tokenize'
import type { FileRow, FilterRule, ListingScope, QuickFilters, SortDir, SortField, WordFrequencyEntry } from '../../../shared/types'

export interface GroupBucket {
  label: string
  rows: FileRow[]
}

export interface UseGroupingResult {
  groupWords: string[]
  setGroupWords: React.Dispatch<React.SetStateAction<string[]>>
  groupedLoading: boolean
  collapsedGroups: Set<string>
  groups: GroupBucket[]
  groupFlatRows: FileRow[]
  groupCounts: number[]
  wordFrequency: WordFrequencyEntry[]
  analyzingWords: boolean
  handleToggleGroupCollapse: (label: string) => void
  handleSelectGroupWord: (word: string) => void
  handleRemoveGroupWord: (word: string) => void
  handleAnalyzeWords: () => Promise<void>
}

// "Analyze words" surfaces candidate group words by frequency (wordFrequency/analyzingWords);
// clicking one adds it to groupWords, which buckets the current (unpaginated) listing into
// named groups for the grouped table/gallery views. patternHistory (the filter-rule builder's
// separate "recent patterns" list) is NOT part of this hook, despite being adjacent UI - it's a
// different feature (recalling a past filter pattern, not grouping the listing by word).
export function useGrouping(
  buildScope: (dir: string | null) => ListingScope | null,
  currentDir: string | null,
  filterRules: FilterRule[],
  quickFilters: QuickFilters,
  sortField: SortField,
  sortDir: SortDir
): UseGroupingResult {
  const [groupWords, setGroupWords] = useState<string[]>([])
  const [groupedRows, setGroupedRows] = useState<FileRow[]>([])
  const [groupedLoading, setGroupedLoading] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [wordFrequency, setWordFrequency] = useState<WordFrequencyEntry[]>([])
  const [analyzingWords, setAnalyzingWords] = useState(false)

  const loadGroupedRows = useCallback(async (): Promise<void> => {
    const scope = buildScope(currentDir)
    if (!scope || groupWords.length === 0) {
      setGroupedRows([])
      return
    }
    setGroupedLoading(true)
    try {
      const allRows = await window.api.queryAllMatching({
        scope,
        filterRules,
        quickFilters,
        sortField,
        sortDir,
        limit: 0,
        offset: 0
      })
      setGroupedRows(allRows)
    } finally {
      setGroupedLoading(false)
    }
  }, [buildScope, currentDir, groupWords, filterRules, quickFilters, sortField, sortDir])

  useEffect(() => {
    void loadGroupedRows()
  }, [loadGroupedRows])

  const groups = useMemo((): GroupBucket[] => {
    if (groupWords.length === 0) return []
    const buckets = new Map<string, FileRow[]>(groupWords.map((word) => [word, []]))
    const other: FileRow[] = []
    for (const row of groupedRows) {
      const tokens = tokenizeFileName(row.name)
      const match = groupWords.find((word) => tokens.includes(word))
      if (match) buckets.get(match)?.push(row)
      else other.push(row)
    }
    return [
      ...groupWords.map((word) => ({ label: word, rows: buckets.get(word) ?? [] })),
      { label: 'Other', rows: other }
    ].filter((group) => group.rows.length > 0)
  }, [groupWords, groupedRows])

  const groupFlatRows = useMemo(
    () => groups.flatMap((group) => (collapsedGroups.has(group.label) ? [] : group.rows)),
    [groups, collapsedGroups]
  )
  const groupCounts = useMemo(
    () => groups.map((group) => (collapsedGroups.has(group.label) ? 0 : group.rows.length)),
    [groups, collapsedGroups]
  )

  const handleToggleGroupCollapse = useCallback((label: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      return next
    })
  }, [])

  const handleSelectGroupWord = useCallback((word: string): void => {
    setGroupWords((prev) => (prev.includes(word) ? prev.filter((w) => w !== word) : [...prev, word]))
  }, [])

  const handleRemoveGroupWord = useCallback((word: string): void => {
    setGroupWords((prev) => prev.filter((w) => w !== word))
  }, [])

  const handleAnalyzeWords = useCallback(async (): Promise<void> => {
    const scope = buildScope(currentDir)
    if (!scope) return
    setAnalyzingWords(true)
    try {
      const words = await window.api.analyzeWords({ scope, filterRules, quickFilters })
      setWordFrequency(words)
    } finally {
      setAnalyzingWords(false)
    }
  }, [buildScope, currentDir, filterRules, quickFilters])

  return {
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
  }
}
