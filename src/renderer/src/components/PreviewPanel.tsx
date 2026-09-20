import { theme } from '../constants'
import { FileTypeIcon, getTypeLabel } from '../fileDisplay'
import { formatBytes } from '../pathUtils'
import type { PreviewSlot } from '../types'

export interface PreviewPanelProps {
  selectedCount: number
  selectionAggregate: { count: number; totalSizeBytes: number } | null
  matchHints: string[]
  previewSlots: PreviewSlot[]
  onOpenLightbox: (url: string) => void
  onCarouselPrev: (slotIndex: number) => void
  onCarouselNext: (slotIndex: number) => void
  onSetCarouselIndex: (slotIndex: number, frameIndex: number) => void
}

function PreviewCard({
  slot,
  slotIndex,
  cardWidth,
  onOpenLightbox,
  onCarouselPrev,
  onCarouselNext,
  onSetCarouselIndex
}: {
  slot: PreviewSlot
  slotIndex: number
  cardWidth: number
  onOpenLightbox: (url: string) => void
  onCarouselPrev: (slotIndex: number) => void
  onCarouselNext: (slotIndex: number) => void
  onSetCarouselIndex: (slotIndex: number, frameIndex: number) => void
}): React.JSX.Element {
  const { row, frames, animatedUrl, carouselIndex } = slot
  return (
    <div style={{ width: cardWidth, flexShrink: 0 }}>
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
            onClick={() => onOpenLightbox(animatedUrl ?? frames[carouselIndex].dataUrl)}
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
                    onCarouselPrev(slotIndex)
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
                    onCarouselNext(slotIndex)
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
                    onSetCarouselIndex(slotIndex, index)
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

export function PreviewPanel({
  selectedCount,
  selectionAggregate,
  matchHints,
  previewSlots,
  onOpenLightbox,
  onCarouselPrev,
  onCarouselNext,
  onSetCarouselIndex
}: PreviewPanelProps): React.JSX.Element {
  return (
    <div
      style={{
        width: selectedCount === 0 ? 0 : selectedCount === 2 ? 460 : 260,
        flexShrink: 0,
        overflow: 'hidden',
        transition: 'width 200ms ease',
        borderLeft: selectedCount > 0 ? `1px solid ${theme.border}` : 'none'
      }}
    >
      <div style={{ width: selectedCount === 2 ? 460 : 260, padding: 12, fontSize: 12, boxSizing: 'border-box' }}>
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
                style={{ background: theme.pillBg, color: theme.pillText, borderRadius: 4, padding: '2px 6px', fontSize: 11 }}
              >
                {hint}
              </span>
            ))}
          </div>
        )}
        {selectedCount === 1 && previewSlots[0] && (
          <PreviewCard
            slot={previewSlots[0]}
            slotIndex={0}
            cardWidth={260}
            onOpenLightbox={onOpenLightbox}
            onCarouselPrev={onCarouselPrev}
            onCarouselNext={onCarouselNext}
            onSetCarouselIndex={onSetCarouselIndex}
          />
        )}
        {selectedCount === 2 && (
          <div style={{ display: 'flex', gap: 12 }}>
            {previewSlots.map((slot, index) => (
              <PreviewCard
                key={slot.row.path}
                slot={slot}
                slotIndex={index}
                cardWidth={212}
                onOpenLightbox={onOpenLightbox}
                onCarouselPrev={onCarouselPrev}
                onCarouselNext={onCarouselNext}
                onSetCarouselIndex={onSetCarouselIndex}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
