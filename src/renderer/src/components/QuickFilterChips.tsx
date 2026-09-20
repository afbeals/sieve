import { DATE_PRESETS, SIZE_PRESETS, theme } from '../constants'
import { EXTENSION_GROUPS } from '../fileDisplay'

export interface QuickFilterChipsProps {
  activeExtensionGroups: Set<string>
  activeSizePreset: string | null
  activeDatePreset: string | null
  onToggleExtensionGroup: (label: string) => void
  onToggleSizePreset: (label: string) => void
  onToggleDatePreset: (label: string) => void
}

export function QuickFilterChips({
  activeExtensionGroups,
  activeSizePreset,
  activeDatePreset,
  onToggleExtensionGroup,
  onToggleSizePreset,
  onToggleDatePreset
}: QuickFilterChipsProps): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 12px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        flexWrap: 'wrap',
        fontSize: 12
      }}
    >
      <span style={{ color: theme.muted }}>Quick filters:</span>
      {EXTENSION_GROUPS.map((group) => (
        <button
          key={group.label}
          onClick={() => onToggleExtensionGroup(group.label)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            border: `1px solid ${theme.chipBorder}`,
            borderRadius: 12,
            padding: '2px 8px',
            cursor: 'pointer',
            background: activeExtensionGroups.has(group.label) ? theme.accent : theme.chipBg,
            color: activeExtensionGroups.has(group.label) ? theme.accentText : theme.fg
          }}
        >
          <group.icon size={13} />
          {group.label}
        </button>
      ))}
      {SIZE_PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onToggleSizePreset(preset.label)}
          style={{
            border: `1px solid ${theme.chipBorder}`,
            borderRadius: 12,
            padding: '2px 8px',
            cursor: 'pointer',
            background: activeSizePreset === preset.label ? theme.accent : theme.chipBg,
            color: activeSizePreset === preset.label ? theme.accentText : theme.fg
          }}
        >
          {preset.label}
        </button>
      ))}
      {DATE_PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => onToggleDatePreset(preset.label)}
          style={{
            border: `1px solid ${theme.chipBorder}`,
            borderRadius: 12,
            padding: '2px 8px',
            cursor: 'pointer',
            background: activeDatePreset === preset.label ? theme.accent : theme.chipBg,
            color: activeDatePreset === preset.label ? theme.accentText : theme.fg
          }}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
