import { Button } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { theme } from '../constants'
import type { GroupBucket } from '../hooks/useGrouping'
import type { PatternHistoryEntry, WordFrequencyEntry } from '../../../shared/types'

export interface GroupingBarProps {
  rootPath: string | null
  analyzingWords: boolean
  groupWords: string[]
  groupedLoading: boolean
  wordFrequency: WordFrequencyEntry[]
  patternHistory: PatternHistoryEntry[]
  groups: GroupBucket[]
  onAnalyzeWords: () => void
  onRemoveGroupWord: (word: string) => void
  onSelectGroupWord: (word: string) => void
  onUseHistoryPattern: (entry: PatternHistoryEntry) => void
  onJumpToGroup: (groupIndex: number) => void
}

export function GroupingBar({
  rootPath,
  analyzingWords,
  groupWords,
  groupedLoading,
  wordFrequency,
  patternHistory,
  groups,
  onAnalyzeWords,
  onRemoveGroupWord,
  onSelectGroupWord,
  onUseHistoryPattern,
  onJumpToGroup
}: GroupingBarProps): React.JSX.Element {
  return (
    <>
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${theme.border}`, fontSize: 12 }}>
        {/* Analyze button + selected-word tags get their own fixed row, separate from the word
            list below - previously everything shared one flex-wrap row, so the whole toolbar
            visibly shifted down every time a new word chip wrapped onto another line. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button variant="default" size="xs" style={{ flexShrink: 0 }} onClick={onAnalyzeWords} disabled={analyzingWords || !rootPath}>
            {analyzingWords ? 'Analyzing…' : 'Analyze words'}
          </Button>
          {groupWords.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
              <span style={{ flexShrink: 0 }}>Grouping by:</span>
              {/* Scrolls horizontally instead of wrapping - with many selected words this row
                  would otherwise grow to several lines and keep pushing the word list down. */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', overflowX: 'auto', flexShrink: 1 }}>
                {groupWords.map((word) => (
                  <span key={word} style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    <code>{word}</code>
                    <button
                      style={{ display: 'flex', border: 'none', background: 'none', cursor: 'pointer', color: theme.fg }}
                      onClick={() => onRemoveGroupWord(word)}
                    >
                      <IconX size={11} />
                    </button>
                  </span>
                ))}
              </div>
              {groupedLoading && <span style={{ flexShrink: 0 }}>(loading…)</span>}
            </div>
          )}
        </div>
        {wordFrequency.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginTop: 8, paddingBottom: 4 }}>
            {wordFrequency.map((entry) => (
              <button
                key={entry.word}
                onClick={() => onSelectGroupWord(entry.word)}
                style={{
                  flexShrink: 0,
                  border: `1px solid ${theme.chipBorder}`,
                  borderRadius: 12,
                  padding: '2px 8px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  background: groupWords.includes(entry.word) ? theme.accent : theme.chipBg,
                  color: groupWords.includes(entry.word) ? theme.accentText : theme.fg
                }}
              >
                {entry.word} ({entry.count})
              </button>
            ))}
          </div>
        )}
      </div>
      {patternHistory.length > 0 && (
        <div
          style={{
            padding: '4px 12px 8px',
            display: 'flex',
            gap: 6,
            alignItems: 'center',
            flexWrap: 'wrap',
            fontSize: 12
          }}
        >
          <span style={{ color: theme.muted }}>Recent:</span>
          {patternHistory.map((entry) => (
            <button
              key={`${entry.mode}:${entry.pattern}`}
              onClick={() => onUseHistoryPattern(entry)}
              style={{
                border: `1px solid ${theme.chipBorder}`,
                borderRadius: 4,
                padding: '1px 6px',
                cursor: 'pointer',
                background: theme.chipBg,
                color: theme.fg
              }}
            >
              <code>{entry.pattern}</code> <span style={{ color: theme.muted }}>({entry.mode})</span>
            </button>
          ))}
        </div>
      )}
      {groupWords.length > 0 && groups.length > 0 && (
        <div
          style={{
            padding: '4px 12px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            fontSize: 12
          }}
        >
          <span style={{ color: theme.muted }}>Jump to:</span>
          {groups.map((group, index) => (
            <button
              key={group.label}
              onClick={() => onJumpToGroup(index)}
              style={{
                border: `1px solid ${theme.chipBorder}`,
                borderRadius: 4,
                padding: '1px 6px',
                cursor: 'pointer',
                background: theme.chipBg,
                color: theme.fg
              }}
            >
              {group.label} ({group.rows.length})
            </button>
          ))}
        </div>
      )}
    </>
  )
}
