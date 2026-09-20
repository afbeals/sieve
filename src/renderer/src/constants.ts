import type { SortField } from '../../shared/types'

export const SORT_COLUMNS: { field: SortField; label: string; align: 'left' | 'right' }[] = [
  { field: 'name', label: 'Name', align: 'left' },
  { field: 'size', label: 'Size', align: 'right' },
  { field: 'mtimeMs', label: 'Modified', align: 'left' },
  { field: 'ctimeMs', label: 'Created', align: 'left' }
]

// Persistent layout (#32): fallback widths for a fresh session / older settings file that
// predates a given column key.
export const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  name: 320,
  size: 110,
  mtimeMs: 170,
  ctimeMs: 170
}

// Real Mantine CSS variables (set by MantineProvider, and re-resolved automatically whenever
// the color scheme changes - no light/dark JS branch needed) instead of a hand-rolled palette,
// so every custom-styled element below stays in sync with Mantine's own light/dark tokens.
export const theme = {
  bg: 'var(--mantine-color-body)',
  fg: 'var(--mantine-color-text)',
  muted: 'var(--mantine-color-dimmed)',
  border: 'var(--mantine-color-default-border)',
  headerBg: 'var(--mantine-color-default)',
  selectedBg: 'var(--mantine-primary-color-light)',
  selectedBorder: 'var(--mantine-primary-color-filled)',
  dragOverBg: 'var(--mantine-color-green-light)',
  dragOverBorder: 'var(--mantine-color-green-filled)',
  chipBg: 'var(--mantine-color-default)',
  chipBorder: 'var(--mantine-color-default-border)',
  pillBg: 'var(--mantine-color-blue-light)',
  pillText: 'var(--mantine-color-blue-light-color)',
  accent: 'var(--mantine-primary-color-filled)',
  accentText: 'var(--mantine-primary-color-contrast)',
  dangerText: 'var(--mantine-color-error)',
  errorBg: 'var(--mantine-color-red-light)',
  errorText: 'var(--mantine-color-red-light-color)'
}

export const SIZE_PRESETS: { label: string; minSizeBytes: number }[] = [
  { label: '≥100MB', minSizeBytes: 100 * 1024 * 1024 },
  { label: '≥1GB', minSizeBytes: 1024 * 1024 * 1024 }
]

export const DATE_PRESETS: { label: string; withinMs: number }[] = [
  { label: 'Today', withinMs: 24 * 60 * 60 * 1000 },
  { label: 'This week', withinMs: 7 * 24 * 60 * 60 * 1000 },
  { label: 'This month', withinMs: 30 * 24 * 60 * 60 * 1000 }
]

export const PAGE_SIZE = 200
