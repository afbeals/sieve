import { Button, Checkbox, Select, TextInput } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { theme } from '../constants'
import type { FilterCombinator, FilterMode, FilterRule } from '../../../shared/types'

export interface FilterRuleBuilderProps {
  filterRules: FilterRule[]
  draftPattern: string
  setDraftPattern: (value: string) => void
  draftMode: FilterMode
  setDraftMode: (mode: FilterMode) => void
  draftInvert: boolean
  setDraftInvert: (invert: boolean) => void
  draftCombinator: FilterCombinator
  setDraftCombinator: (combinator: FilterCombinator) => void
  previewCount: number | null
  previewLoading: boolean
  onAddFilter: () => void
  onRemoveFilter: (id: string) => void
}

export function FilterRuleBuilder({
  filterRules,
  draftPattern,
  setDraftPattern,
  draftMode,
  setDraftMode,
  draftInvert,
  setDraftInvert,
  draftCombinator,
  setDraftCombinator,
  previewCount,
  previewLoading,
  onAddFilter,
  onRemoveFilter
}: FilterRuleBuilderProps): React.JSX.Element {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap'
      }}
    >
      {filterRules.map((rule, index) => (
        <span
          key={rule.id}
          style={{
            display: 'flex',
            gap: 4,
            alignItems: 'center',
            background: theme.pillBg,
            borderRadius: 4,
            padding: '2px 6px',
            fontSize: 12
          }}
        >
          {index > 0 && <strong>{rule.combinator}</strong>}
          {rule.invert && <span>NOT</span>}
          <code>{rule.pattern}</code>
          <span style={{ color: theme.muted }}>({rule.mode})</span>
          <button
            style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer' }}
            onClick={() => onRemoveFilter(rule.id)}
          >
            <IconX size={11} />
          </button>
        </span>
      ))}
      {filterRules.length > 0 && (
        <Select
          data={[
            { value: 'AND', label: 'AND' },
            { value: 'OR', label: 'OR' }
          ]}
          value={draftCombinator}
          onChange={(value) => {
            if (value) setDraftCombinator(value as FilterCombinator)
          }}
          w={70}
          size="xs"
          allowDeselect={false}
        />
      )}
      <TextInput
        placeholder="regex pattern…"
        value={draftPattern}
        onChange={(event) => setDraftPattern(event.currentTarget.value)}
        w={180}
        size="xs"
      />
      <Select
        data={[
          { value: 'fuzzy', label: 'fuzzy' },
          { value: 'strict', label: 'strict regex' }
        ]}
        value={draftMode}
        onChange={(value) => {
          if (value) setDraftMode(value as FilterMode)
        }}
        w={130}
        size="xs"
        allowDeselect={false}
      />
      <Checkbox checked={draftInvert} onChange={(event) => setDraftInvert(event.currentTarget.checked)} label="NOT" size="xs" />
      <Button size="xs" variant="default" onClick={onAddFilter} disabled={!draftPattern}>
        Add filter
      </Button>
      {draftPattern && (
        <span style={{ fontSize: 12, color: theme.muted }}>{previewLoading ? 'counting…' : `${previewCount ?? 0} would match`}</span>
      )}
    </div>
  )
}
