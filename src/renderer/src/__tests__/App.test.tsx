// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FileRow, ListingResult } from '../../../shared/types'
import { renderApp } from '../test/renderApp'

function makeRow(overrides: Partial<FileRow> & { path: string; name: string }): FileRow {
  return {
    parentDir: '/root',
    ext: '',
    size: 1024,
    ctimeMs: 1_700_000_000_000,
    mtimeMs: 1_700_000_000_000,
    isDirectory: 0,
    ...overrides
  }
}

// Drives the app through "pick a folder -> scan finishes -> listing loads" the same way a real
// session does: click Choose folder, let the mocked pickRoot/startScan resolve, then fire the
// onScanDone callback the component registered - which is what actually triggers the reload()
// that calls queryListing and paints the rows.
async function pickRootAndFinishScan(rows: FileRow[]): Promise<ReturnType<typeof renderApp>> {
  const listingResult: ListingResult = { rows, total: rows.length }
  const app = renderApp({
    queryListing: vi.fn(async () => listingResult)
  })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Choose folder…' }))
  await waitFor(() => expect(app.api.startScan).toHaveBeenCalledWith('/root'))
  app.api.fireScanDone({ rootPath: '/root', total: rows.length })
  // reload() -> loadPage() -> queryListing() is async (a real IPC round trip in production);
  // waiting for the mock to have actually been called and resolved avoids a race where a test's
  // very first assertion runs before the resulting setRows() has committed.
  await waitFor(() => expect(app.api.queryListing).toHaveBeenCalled())
  return app
}

describe('App (initial render)', () => {
  it('renders the toolbar with no folder picked yet, with no crash', () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Choose folder…' })).toBeInTheDocument()
  })
})

describe('App (picking a root and viewing the listing)', () => {
  it('loads and renders rows once the scan finishes', async () => {
    await pickRootAndFinishScan([
      makeRow({ path: '/root/a.txt', name: 'a.txt' }),
      makeRow({ path: '/root/b.txt', name: 'b.txt' })
    ])

    expect(await screen.findByText('a.txt')).toBeInTheDocument()
    expect(screen.getByText('b.txt')).toBeInTheDocument()
  })

  it('shows the item count once scanning finishes', async () => {
    await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt' })])
    expect(await screen.findByText('1 items')).toBeInTheDocument()
  })
})

describe('App (selecting a row)', () => {
  it('shows the selected file details in the preview panel', async () => {
    await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt', size: 2048 })])
    const user = userEvent.setup()

    await user.click(await screen.findByText('a.txt'))

    // The details panel renders a Type/Size/Modified/... grid for the single selected file -
    // its size (formatted) appearing confirms the panel picked up the click, not just the row.
    expect(await screen.findByText('2.0 KB')).toBeInTheDocument()
  })
})

describe('App (delete confirmation gate)', () => {
  it('asks for confirmation before deleting, and only calls deletePaths after confirming', async () => {
    const app = await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt' })])
    const user = userEvent.setup()

    await user.click(await screen.findByText('a.txt'))
    await user.click(screen.getByRole('button', { name: /Delete 1 item/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete files' })
    expect(app.api.deletePaths).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(app.api.deletePaths).toHaveBeenCalledWith('/root', ['/root/a.txt']))
  })

  it('does not delete anything when the confirmation is cancelled', async () => {
    const app = await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt' })])
    const user = userEvent.setup()

    await user.click(await screen.findByText('a.txt'))
    await user.click(screen.getByRole('button', { name: /Delete 1 item/ }))

    const dialog = await screen.findByRole('dialog', { name: 'Delete files' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Delete files' })).not.toBeInTheDocument()
    expect(app.api.deletePaths).not.toHaveBeenCalled()
  })
})

describe('App (regex filter rules)', () => {
  it('adds a filter rule chip after typing a pattern and clicking Add filter', async () => {
    await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt' })])
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('regex pattern…'), 'vacation')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))

    expect(await screen.findByText('vacation')).toBeInTheDocument()
  })

  it('re-queries with the new filter rule applied', async () => {
    const app = await pickRootAndFinishScan([makeRow({ path: '/root/a.txt', name: 'a.txt' })])
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('regex pattern…'), 'vacation')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))

    await waitFor(() =>
      expect(app.api.queryListing).toHaveBeenLastCalledWith(
        expect.objectContaining({
          filterRules: [expect.objectContaining({ pattern: 'vacation', mode: 'fuzzy', invert: false })]
        })
      )
    )
  })
})
