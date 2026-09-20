import { Button, Popover } from '@mantine/core'
import { IconPin, IconX } from '@tabler/icons-react'
import { theme } from '../constants'
import { FileTypeIcon } from '../fileDisplay'
import type { FileRow } from '../../../shared/types'

export interface PinnedPopoverProps {
  opened: boolean
  setOpened: React.Dispatch<React.SetStateAction<boolean>>
  pinnedRows: Map<string, FileRow>
  onClearPinned: () => void
  onUnpin: (path: string) => void
  onSelectPinned: () => void
}

export function PinnedPopover({ opened, setOpened, pinnedRows, onClearPinned, onUnpin, onSelectPinned }: PinnedPopoverProps): React.JSX.Element {
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={300} shadow="md">
      <Popover.Target>
        <Button
          variant="default"
          size="sm"
          leftSection={<IconPin size={14} />}
          disabled={pinnedRows.size === 0}
          onClick={() => setOpened((prev) => !prev)}
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
          <button onClick={onClearPinned} style={{ fontSize: 12, fontWeight: 400 }}>
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
              <button onClick={() => onUnpin(row.path)} style={{ display: 'flex' }}>
                <IconX size={12} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ padding: '8px 12px', borderTop: `1px solid ${theme.border}` }}>
          <button onClick={onSelectPinned} style={{ width: '100%' }}>
            Select All Pinned
          </button>
        </div>
      </Popover.Dropdown>
    </Popover>
  )
}
