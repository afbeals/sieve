import { Button, Popover } from '@mantine/core'
import { IconChartBar } from '@tabler/icons-react'
import { theme } from '../constants'
import { formatBytes } from '../pathUtils'
import type { StorageBreakdownEntry } from '../../../shared/types'

export interface StoragePopoverProps {
  opened: boolean
  setOpened: React.Dispatch<React.SetStateAction<boolean>>
  storageBreakdown: StorageBreakdownEntry[]
}

export function StoragePopover({ opened, setOpened, storageBreakdown }: StoragePopoverProps): React.JSX.Element {
  const maxBytes = storageBreakdown[0]?.totalSizeBytes || 1
  return (
    <Popover opened={opened} onChange={setOpened} position="bottom-end" width={320} shadow="md">
      <Popover.Target>
        <Button variant="default" size="sm" leftSection={<IconChartBar size={14} />} onClick={() => setOpened((prev) => !prev)}>
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
  )
}
