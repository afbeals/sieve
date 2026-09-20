import { IconX } from '@tabler/icons-react'
import { theme } from '../constants'

export interface ErrorToastProps {
  message: string
  onDismiss: () => void
}

export function ErrorToast({ message, onDismiss }: ErrorToastProps): React.JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        background: theme.errorBg,
        color: theme.errorText,
        border: `1px solid ${theme.errorText}`,
        borderRadius: 6,
        padding: '8px 14px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        zIndex: 1200
      }}
    >
      {message}
      <button onClick={onDismiss} style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer' }}>
        <IconX size={14} />
      </button>
    </div>
  )
}
