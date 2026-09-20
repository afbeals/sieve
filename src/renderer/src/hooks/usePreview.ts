import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileRow } from '../../../shared/types'
import type { PreviewSlot } from '../types'

export interface UsePreviewResult {
  previewSlots: PreviewSlot[]
  lightboxUrl: string | null
  setLightboxUrl: (url: string | null) => void
  thumbnailProgress: { processed: number; total: number } | null
  setThumbnailProgress: (progress: { processed: number; total: number } | null) => void
  loadPreviewSlots: () => Promise<void>
  handleCarouselPrev: (slotIndex: number) => void
  handleCarouselNext: (slotIndex: number) => void
  handleSetCarouselIndex: (slotIndex: number, frameIndex: number) => void
}

export function usePreview(selectedRows: FileRow[]): UsePreviewResult {
  const [previewSlots, setPreviewSlots] = useState<PreviewSlot[]>([])
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [thumbnailProgress, setThumbnailProgress] = useState<{ processed: number; total: number } | null>(null)

  // Guards against a stale async thumbnail fetch overwriting a newer selection's slots - the
  // signature is recomputed fresh every render (not shared with useSelection's own ref) so this
  // hook only needs `selectedRows` as an input, not a specific ref instance.
  const selectedPathsRef = useRef('')
  selectedPathsRef.current = selectedRows.map((row) => row.path).join('|')

  const loadPreviewSlots = useCallback(async (): Promise<void> => {
    const signature = selectedRows.map((row) => row.path).join('|')
    if (selectedRows.length === 0 || selectedRows.length > 2) {
      setPreviewSlots([])
      return
    }
    const slots = await Promise.all(
      selectedRows.map(async (row): Promise<PreviewSlot> => {
        if (row.isDirectory) return { row, frames: [], animatedUrl: null, carouselIndex: 0 }
        const frames = await window.api.getThumbnails(row.path)
        const animatedUrl = row.ext === 'gif' ? await window.api.getOriginalMedia(row.path) : null
        return { row, frames, animatedUrl, carouselIndex: 0 }
      })
    )
    if (selectedPathsRef.current !== signature) return
    setPreviewSlots(slots)
  }, [selectedRows])

  useEffect(() => {
    void loadPreviewSlots()
  }, [loadPreviewSlots])

  useEffect(() => {
    if (!lightboxUrl) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setLightboxUrl(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [lightboxUrl])

  const handleCarouselPrev = useCallback((slotIndex: number): void => {
    setPreviewSlots((prev) =>
      prev.map((slot, index) =>
        index === slotIndex
          ? { ...slot, carouselIndex: (slot.carouselIndex - 1 + slot.frames.length) % slot.frames.length }
          : slot
      )
    )
  }, [])

  const handleCarouselNext = useCallback((slotIndex: number): void => {
    setPreviewSlots((prev) =>
      prev.map((slot, index) =>
        index === slotIndex ? { ...slot, carouselIndex: (slot.carouselIndex + 1) % slot.frames.length } : slot
      )
    )
  }, [])

  const handleSetCarouselIndex = useCallback((slotIndex: number, frameIndex: number): void => {
    setPreviewSlots((prev) => prev.map((slot, index) => (index === slotIndex ? { ...slot, carouselIndex: frameIndex } : slot)))
  }, [])

  return {
    previewSlots,
    lightboxUrl,
    setLightboxUrl,
    thumbnailProgress,
    setThumbnailProgress,
    loadPreviewSlots,
    handleCarouselPrev,
    handleCarouselNext,
    handleSetCarouselIndex
  }
}
