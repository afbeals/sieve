import { Button, Checkbox, Group, Modal, NumberInput, Select, Stack, Text } from '@mantine/core'
import { SORT_COLUMNS } from '../constants'
import type { AppSettings, SortDir, SortField } from '../../../shared/types'

export interface SettingsModalProps {
  opened: boolean
  settingsDraft: AppSettings | null
  setSettingsDraft: (draft: AppSettings) => void
  onCancel: () => void
  onSave: () => void
  onExportConfig: () => void
  onImportConfig: () => void
}

export function SettingsModal({
  opened,
  settingsDraft,
  setSettingsDraft,
  onCancel,
  onSave,
  onExportConfig,
  onImportConfig
}: SettingsModalProps): React.JSX.Element {
  return (
    <Modal opened={opened && !!settingsDraft} onClose={onCancel} title="Settings" size="sm">
      {settingsDraft && (
        <Stack gap={6}>
          <Text fw={600}>Thumbnails</Text>
          <Group justify="space-between">
            <Text size="sm">Video frame count</Text>
            <NumberInput
              min={1}
              max={12}
              value={settingsDraft.thumbnails.videoFrameCount}
              onChange={(value) =>
                setSettingsDraft({
                  ...settingsDraft,
                  thumbnails: { ...settingsDraft.thumbnails, videoFrameCount: Number(value) || 1 }
                })
              }
              w={80}
            />
          </Group>
          <Group justify="space-between">
            <Text size="sm">Resolution (px)</Text>
            <NumberInput
              min={100}
              max={2000}
              step={50}
              value={settingsDraft.thumbnails.resolution}
              onChange={(value) =>
                setSettingsDraft({
                  ...settingsDraft,
                  thumbnails: { ...settingsDraft.thumbnails, resolution: Number(value) || 100 }
                })
              }
              w={80}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Only affects thumbnails generated after saving - existing ones need a manual cache
            clear to regenerate at a new size.
          </Text>

          <Text fw={600} mt="xs">
            Performance
          </Text>
          <Group justify="space-between">
            <Text size="sm">Thumbnail worker concurrency</Text>
            <NumberInput
              min={1}
              max={8}
              value={settingsDraft.performance.workerConcurrency}
              onChange={(value) =>
                setSettingsDraft({
                  ...settingsDraft,
                  performance: { ...settingsDraft.performance, workerConcurrency: Number(value) || 1 }
                })
              }
              w={80}
            />
          </Group>

          <Text fw={600} mt="xs">
            Trash
          </Text>
          <Group gap={6}>
            <Checkbox
              checked={settingsDraft.trash.autoPurgeDays !== null}
              onChange={(event) =>
                setSettingsDraft({
                  ...settingsDraft,
                  trash: { autoPurgeDays: event.currentTarget.checked ? 30 : null }
                })
              }
              label="Automatically empty trash older than"
            />
            <NumberInput
              min={1}
              max={365}
              disabled={settingsDraft.trash.autoPurgeDays === null}
              value={settingsDraft.trash.autoPurgeDays ?? 30}
              onChange={(value) => setSettingsDraft({ ...settingsDraft, trash: { autoPurgeDays: Number(value) || 1 } })}
              w={70}
            />
            <Text size="sm">days</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Off by default (manual Empty Trash only).
          </Text>

          <Text fw={600} mt="xs">
            Defaults for next launch
          </Text>
          <Group justify="space-between">
            <Text size="sm">Sort field</Text>
            <Select
              data={SORT_COLUMNS.map((column) => ({ value: column.field, label: column.label }))}
              value={settingsDraft.defaultSortField}
              onChange={(value) => {
                if (value) setSettingsDraft({ ...settingsDraft, defaultSortField: value as SortField })
              }}
              w={140}
              allowDeselect={false}
            />
          </Group>
          <Group justify="space-between">
            <Text size="sm">Sort direction</Text>
            <Select
              data={[
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' }
              ]}
              value={settingsDraft.defaultSortDir}
              onChange={(value) => {
                if (value) setSettingsDraft({ ...settingsDraft, defaultSortDir: value as SortDir })
              }}
              w={140}
              allowDeselect={false}
            />
          </Group>
          <Group justify="space-between">
            <Text size="sm">View mode</Text>
            <Select
              data={[
                { value: 'table', label: 'Table' },
                { value: 'gallery', label: 'Gallery' }
              ]}
              value={settingsDraft.defaultViewMode}
              onChange={(value) => {
                if (value) setSettingsDraft({ ...settingsDraft, defaultViewMode: value as 'table' | 'gallery' })
              }}
              w={140}
              allowDeselect={false}
            />
          </Group>

          <Text fw={600} mt="xs">
            Theme
          </Text>
          <Group justify="space-between">
            <Text size="sm">Theme</Text>
            <Select
              data={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' }
              ]}
              value={settingsDraft.theme}
              onChange={(value) => {
                if (value) setSettingsDraft({ ...settingsDraft, theme: value as AppSettings['theme'] })
              }}
              w={140}
              allowDeselect={false}
            />
          </Group>
          <Text size="xs" c="dimmed">
            Applies on Save. &quot;System&quot; follows the OS setting live.
          </Text>

          <Text fw={600} mt="xs">
            Config file
          </Text>
          <Group gap={8}>
            <Button variant="default" size="xs" onClick={onExportConfig}>
              Export…
            </Button>
            <Button variant="default" size="xs" onClick={onImportConfig}>
              Import…
            </Button>
          </Group>
          <Text size="xs" c="dimmed">
            Exports/imports every setting above, including saved views. Regex pattern history is
            stored separately and isn&apos;t included.
          </Text>

          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onSave}>Save</Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
