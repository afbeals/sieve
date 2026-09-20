import { Loader } from '@mantine/core'
import { theme } from '../constants'
import { formatBytes } from '../pathUtils'
import type { ListingAggregate } from '../../../shared/types'

export interface StatusBarProps {
  aggregate: ListingAggregate | null
  backgroundStatus: string | null
}

export function StatusBar({ aggregate, backgroundStatus }: StatusBarProps): React.JSX.Element {
  return (
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
      <span>{aggregate ? `${aggregate.count.toLocaleString()} items in view · ${formatBytes(aggregate.totalSizeBytes)}` : '—'}</span>
      {backgroundStatus && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Loader size="xs" />
          {backgroundStatus}
        </span>
      )}
    </div>
  )
}
