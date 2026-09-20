import {
  GroupedVirtuoso,
  TableVirtuoso,
  VirtuosoGrid,
  type GridItemProps,
  type GroupedVirtuosoHandle,
  type TableVirtuosoHandle,
  type VirtuosoGridHandle
} from 'react-virtuoso'
import { IconPin } from '@tabler/icons-react'
import { DEFAULT_COLUMN_WIDTHS, SORT_COLUMNS, theme } from '../constants'
import { RowIcon } from '../fileDisplay'
import { formatBytes } from '../pathUtils'
import type { GroupBucket } from '../hooks/useGrouping'
import type { GalleryEntry } from '../types'
import type { FileRow, SortDir, SortField } from '../../../shared/types'

interface RowInteractionProps {
  selectedRows: FileRow[]
  dragOverPath: string | null
  pinnedRows: Map<string, FileRow>
  renderNameText: (row: FileRow) => React.JSX.Element
  onSelectRow: (row: FileRow, event: React.MouseEvent) => void
  onContextMenu: (event: React.MouseEvent, row: FileRow | null) => void
  onDragStartRow: (event: React.DragEvent, row: FileRow) => void
  onDragOverRow: (event: React.DragEvent, row: FileRow) => void
  onDragLeaveRow: () => void
  onDropOnRow: (event: React.DragEvent, row: FileRow) => void
}

interface GroupControlsProps {
  collapsedGroups: Set<string>
  onToggleGroupCollapse: (label: string) => void
  onDeleteClick: (rowsOverride?: FileRow[]) => void
}

export interface GalleryListViewProps extends RowInteractionProps, GroupControlsProps {
  galleryVirtuosoRef: React.Ref<VirtuosoGridHandle>
  galleryData: GalleryEntry[]
  groups: GroupBucket[]
  endReached: (() => void) | undefined
  GalleryItemComponent: (props: GridItemProps) => React.JSX.Element
}

export function GalleryListView({
  galleryVirtuosoRef,
  galleryData,
  groups,
  endReached,
  GalleryItemComponent,
  collapsedGroups,
  selectedRows,
  dragOverPath,
  pinnedRows,
  renderNameText,
  onToggleGroupCollapse,
  onDeleteClick,
  onDragStartRow,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
  onSelectRow,
  onContextMenu
}: GalleryListViewProps): React.JSX.Element {
  return (
    <VirtuosoGrid
      ref={galleryVirtuosoRef}
      style={{ height: '100%' }}
      data={galleryData}
      endReached={endReached}
      listClassName="sieve-gallery-list"
      itemClassName="sieve-gallery-item"
      components={{ Item: GalleryItemComponent }}
      itemContent={(_index, entry) => {
        if (entry.kind === 'divider') {
          const collapsed = collapsedGroups.has(entry.label)
          return (
            <div
              onClick={() => onToggleGroupCollapse(entry.label)}
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
                  onDeleteClick(groupRows)
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
            onDragStart={(event) => onDragStartRow(event, row)}
            onDragOver={(event) => onDragOverRow(event, row)}
            onDragLeave={onDragLeaveRow}
            onDrop={(event) => onDropOnRow(event, row)}
            onClick={(event) => onSelectRow(row, event)}
            onContextMenu={(event) => onContextMenu(event, row)}
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
            {!row.isDirectory && <span style={{ fontSize: 11, color: theme.muted }}>{formatBytes(row.size)}</span>}
          </div>
        )
      }}
    />
  )
}

export interface GroupedListViewProps extends RowInteractionProps, GroupControlsProps {
  groupedVirtuosoRef: React.Ref<GroupedVirtuosoHandle>
  groupCounts: number[]
  groups: GroupBucket[]
  groupFlatRows: FileRow[]
}

export function GroupedListView({
  groupedVirtuosoRef,
  groupCounts,
  groups,
  groupFlatRows,
  collapsedGroups,
  selectedRows,
  dragOverPath,
  pinnedRows,
  renderNameText,
  onToggleGroupCollapse,
  onDeleteClick,
  onDragStartRow,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
  onSelectRow,
  onContextMenu
}: GroupedListViewProps): React.JSX.Element {
  return (
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
            onClick={() => onToggleGroupCollapse(group.label)}
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
              {collapsed ? '▸' : '▾'} {group.label} — {group.rows.length.toLocaleString()} items, {formatBytes(totalSize)}
            </span>
            <button
              onClick={(event) => {
                event.stopPropagation()
                onDeleteClick(group.rows)
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
            onDragStart={(event) => onDragStartRow(event, row)}
            onDragOver={(event) => onDragOverRow(event, row)}
            onDragLeave={onDragLeaveRow}
            onDrop={(event) => onDropOnRow(event, row)}
            style={{
              display: 'flex',
              padding: '4px 12px',
              cursor: row.isDirectory ? 'pointer' : 'default',
              background: isDragOver ? theme.dragOverBg : isSelected ? theme.selectedBg : 'transparent',
              outline: isDragOver ? `1px solid ${theme.dragOverBorder}` : 'none'
            }}
            onClick={(event) => onSelectRow(row, event)}
            onContextMenu={(event) => onContextMenu(event, row)}
          >
            <span style={{ flex: 1 }}>
              <RowIcon row={row} size={16} /> {pinnedRows.has(row.path) && <IconPin size={11} style={{ verticalAlign: 'middle' }} />}
              {renderNameText(row)}
            </span>
            <span style={{ width: 100, textAlign: 'right' }}>{row.isDirectory ? '' : row.size.toLocaleString()}</span>
            <span style={{ width: 180 }}>{new Date(row.mtimeMs).toLocaleString()}</span>
            <span style={{ width: 180 }}>{new Date(row.ctimeMs).toLocaleString()}</span>
          </div>
        )
      }}
    />
  )
}

export interface TableListViewProps extends RowInteractionProps {
  tableVirtuosoRef: React.Ref<TableVirtuosoHandle>
  rows: FileRow[]
  endReached: () => void
  columnWidths: Record<string, number>
  sortField: SortField
  sortDir: SortDir
  activeResizeColumn: string | null
  hoveredResizeColumn: string | null
  onSortClick: (field: SortField) => void
  onColumnResizeStart: (field: string, event: React.MouseEvent) => void
  onHoverResizeColumn: (field: string | null) => void
}

export function TableListView({
  tableVirtuosoRef,
  rows,
  endReached,
  columnWidths,
  sortField,
  sortDir,
  activeResizeColumn,
  hoveredResizeColumn,
  selectedRows,
  dragOverPath,
  pinnedRows,
  renderNameText,
  onSortClick,
  onColumnResizeStart,
  onHoverResizeColumn,
  onDragStartRow,
  onDragOverRow,
  onDragLeaveRow,
  onDropOnRow,
  onSelectRow,
  onContextMenu
}: TableListViewProps): React.JSX.Element {
  return (
    <TableVirtuoso
      ref={tableVirtuosoRef}
      style={{ height: '100%' }}
      data={rows}
      endReached={endReached}
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
              onClick={() => onSortClick(column.field)}
            >
              {column.label}
              {sortField === column.field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              <div
                onMouseDown={(event) => onColumnResizeStart(column.field, event)}
                onClick={(event) => event.stopPropagation()}
                onMouseEnter={() => onHoverResizeColumn(column.field)}
                onMouseLeave={() => onHoverResizeColumn(null)}
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
                    background: activeResizeColumn === column.field || hoveredResizeColumn === column.field ? theme.accent : theme.border
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
          onDragStart: (event: React.DragEvent) => onDragStartRow(event, row),
          onDragOver: (event: React.DragEvent) => onDragOverRow(event, row),
          onDragLeave: onDragLeaveRow,
          onDrop: (event: React.DragEvent) => onDropOnRow(event, row),
          onContextMenu: (event: React.MouseEvent) => onContextMenu(event, row)
        }
        return (
          <>
            <td
              {...dragProps}
              style={{ ...cellStyle, width: columnWidths.name ?? DEFAULT_COLUMN_WIDTHS.name, cursor: row.isDirectory ? 'pointer' : 'default' }}
              onClick={(event) => onSelectRow(row, event)}
            >
              <RowIcon row={row} size={16} /> {pinnedRows.has(row.path) && <IconPin size={11} style={{ verticalAlign: 'middle' }} />}
              {renderNameText(row)}
            </td>
            <td
              {...dragProps}
              style={{ ...cellStyle, width: columnWidths.size ?? DEFAULT_COLUMN_WIDTHS.size, textAlign: 'right' }}
              onClick={(event) => onSelectRow(row, event)}
            >
              {row.isDirectory ? '' : row.size.toLocaleString()}
            </td>
            <td
              {...dragProps}
              style={{ ...cellStyle, width: columnWidths.mtimeMs ?? DEFAULT_COLUMN_WIDTHS.mtimeMs }}
              onClick={(event) => onSelectRow(row, event)}
            >
              {new Date(row.mtimeMs).toLocaleString()}
            </td>
            <td
              {...dragProps}
              style={{ ...cellStyle, width: columnWidths.ctimeMs ?? DEFAULT_COLUMN_WIDTHS.ctimeMs }}
              onClick={(event) => onSelectRow(row, event)}
            >
              {new Date(row.ctimeMs).toLocaleString()}
            </td>
          </>
        )
      }}
    />
  )
}
