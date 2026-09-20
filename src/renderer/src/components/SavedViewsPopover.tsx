import { Button, Popover } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { theme } from '../constants'
import type { SavedView } from '../../../shared/types'

export interface SavedViewsPopoverProps {
  opened: boolean
  setOpened: React.Dispatch<React.SetStateAction<boolean>>
  savedViews: SavedView[]
  onLoadView: (view: SavedView) => void
  onDeleteView: (id: string) => void
  onOpenSaveView: () => void
}

export function SavedViewsPopover({
  opened,
  setOpened,
  savedViews,
  onLoadView,
  onDeleteView,
  onOpenSaveView
}: SavedViewsPopoverProps): React.JSX.Element {
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={300} shadow="md">
      <Popover.Target>
        <Button variant="default" size="sm" onClick={() => setOpened((prev) => !prev)}>
          Views ({savedViews.length})
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
          <span>Saved Views ({savedViews.length})</span>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {savedViews.length === 0 && <div style={{ padding: '10px 12px', color: theme.muted }}>No saved views yet.</div>}
          {savedViews.map((view) => (
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
                onClick={() => onLoadView(view)}
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
              <button onClick={() => onDeleteView(view.id)} style={{ display: 'flex' }}>
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${theme.border}` }}>
          <button onClick={onOpenSaveView} style={{ width: '100%' }}>
            Save current view…
          </button>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
