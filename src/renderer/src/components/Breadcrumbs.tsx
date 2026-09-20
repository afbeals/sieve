import { theme } from '../constants'
import type { StackEntry } from '../types'

export interface BreadcrumbsProps {
  pathStack: StackEntry[]
  onBreadcrumbClick: (index: number) => void
}

export function Breadcrumbs({ pathStack, onBreadcrumbClick }: BreadcrumbsProps): React.JSX.Element | null {
  if (pathStack.length === 0) return null

  return (
    <div style={{ padding: '6px 12px', borderBottom: `1px solid ${theme.border}` }}>
      {pathStack.map((entry, index) => (
        <span key={entry.path}>
          {index > 0 && <span style={{ margin: '0 4px' }}>/</span>}
          <button
            style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            disabled={index === pathStack.length - 1}
            onClick={() => onBreadcrumbClick(index)}
          >
            {entry.label}
          </button>
        </span>
      ))}
    </div>
  )
}
