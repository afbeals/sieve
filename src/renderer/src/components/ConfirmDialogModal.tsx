import { Button, Group, Modal, Text } from '@mantine/core'
import type { ConfirmDialogState } from '../hooks/useFileOps'

export interface ConfirmDialogModalProps {
  dialog: ConfirmDialogState | null
  onClose: () => void
}

export function ConfirmDialogModal({ dialog, onClose }: ConfirmDialogModalProps): React.JSX.Element {
  return (
    <Modal opened={!!dialog} onClose={onClose} title={dialog?.title} centered>
      <Text size="sm" mb="md">
        {dialog?.message}
      </Text>
      <Group justify="flex-end">
        <Button variant="default" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          color="red"
          size="sm"
          onClick={() => {
            dialog?.onConfirm()
            onClose()
          }}
        >
          {dialog?.confirmLabel}
        </Button>
      </Group>
    </Modal>
  )
}
