import { Button, Group, Modal, Text, TextInput } from '@mantine/core'

export interface BulkRenameModalProps {
  opened: boolean
  itemCount: number
  draft: string
  setDraft: (value: string) => void
  onCancel: () => void
  onCommit: () => void
}

export function BulkRenameModal({ opened, itemCount, draft, setDraft, onCancel, onCommit }: BulkRenameModalProps): React.JSX.Element {
  return (
    <Modal opened={opened} onClose={onCancel} title={`Rename ${itemCount} items`} centered>
      <TextInput
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit()
        }}
      />
      <Text size="xs" c="dimmed" mt={6} mb="md">
        First item becomes &quot;{draft || 'name'}&quot;, the rest become &quot;
        {draft || 'name'} (2)&quot;, &quot;{draft || 'name'} (3)&quot;, etc.
      </Text>
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onCommit}>Rename</Button>
      </Group>
    </Modal>
  )
}
