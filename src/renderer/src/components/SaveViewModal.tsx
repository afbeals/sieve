import { Button, Group, Modal, TextInput } from '@mantine/core'

export interface SaveViewModalProps {
  opened: boolean
  nameDraft: string
  setNameDraft: (value: string) => void
  onCancel: () => void
  onCommit: () => void
}

export function SaveViewModal({ opened, nameDraft, setNameDraft, onCancel, onCommit }: SaveViewModalProps): React.JSX.Element {
  return (
    <Modal opened={opened} onClose={onCancel} title="Save current view" centered>
      <TextInput
        autoFocus
        value={nameDraft}
        onChange={(event) => setNameDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit()
        }}
        placeholder="View name"
        mb="md"
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onCommit}>Save</Button>
      </Group>
    </Modal>
  )
}
