export interface LightboxProps {
  url: string
  onClose: () => void
}

export function Lightbox({ url, onClose }: LightboxProps): React.JSX.Element {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        cursor: 'zoom-out'
      }}
    >
      <img src={url} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }} />
    </div>
  )
}
