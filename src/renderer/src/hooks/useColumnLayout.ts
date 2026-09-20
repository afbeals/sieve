import { useCallback, useState } from 'react'
import { DEFAULT_COLUMN_WIDTHS } from '../constants'

export interface UseColumnLayoutResult {
  columnWidths: Record<string, number>
  setColumnWidths: React.Dispatch<React.SetStateAction<Record<string, number>>>
  activeResizeColumn: string | null
  hoveredResizeColumn: string | null
  setHoveredResizeColumn: (field: string | null) => void
  handleColumnResizeStart: (field: string, event: React.MouseEvent) => void
}

export function useColumnLayout(): UseColumnLayoutResult {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(DEFAULT_COLUMN_WIDTHS)
  const [activeResizeColumn, setActiveResizeColumn] = useState<string | null>(null)
  const [hoveredResizeColumn, setHoveredResizeColumn] = useState<string | null>(null)

  const handleColumnResizeStart = useCallback(
    (field: string, event: React.MouseEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      setActiveResizeColumn(field)
      const startX = event.clientX
      const startWidth = columnWidths[field] ?? DEFAULT_COLUMN_WIDTHS[field] ?? 120
      const handleMouseMove = (moveEvent: MouseEvent): void => {
        const nextWidth = Math.max(60, startWidth + (moveEvent.clientX - startX))
        setColumnWidths((prev) => ({ ...prev, [field]: nextWidth }))
      }
      const handleMouseUp = (): void => {
        setActiveResizeColumn(null)
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [columnWidths]
  )

  return {
    columnWidths,
    setColumnWidths,
    activeResizeColumn,
    hoveredResizeColumn,
    setHoveredResizeColumn,
    handleColumnResizeStart
  }
}
