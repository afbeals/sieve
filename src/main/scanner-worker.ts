import { parentPort, workerData } from 'node:worker_threads'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { getExtension, TRASH_DIR_NAME } from './paths'
import type { FileRow } from '../shared/types'

interface ScanMessage {
  type: 'batch' | 'done' | 'error'
  entries?: FileRow[]
  total?: number
  error?: string
}

const rootPath = workerData.rootPath as string
const BATCH_SIZE = 500

async function scan(): Promise<void> {
  let batch: FileRow[] = []
  let total = 0
  const stack: string[] = [rootPath]

  const flush = (): void => {
    if (batch.length === 0) return
    parentPort?.postMessage({ type: 'batch', entries: batch } satisfies ScanMessage)
    total += batch.length
    batch = []
  }

  while (stack.length > 0) {
    const dir = stack.pop() as string
    let dirEntries
    try {
      dirEntries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }

    for (const entry of dirEntries) {
      if (entry.isDirectory() && entry.name === TRASH_DIR_NAME) continue
      const entryPath = join(dir, entry.name)
      let stats
      try {
        stats = await stat(entryPath)
      } catch {
        continue
      }

      const isDirectory = entry.isDirectory()

      batch.push({
        path: entryPath,
        name: entry.name,
        parentDir: dir,
        ext: isDirectory ? '' : getExtension(entry.name),
        size: stats.size,
        ctimeMs: stats.ctimeMs,
        mtimeMs: stats.mtimeMs,
        isDirectory: isDirectory ? 1 : 0
      })

      if (isDirectory) {
        stack.push(entryPath)
      }

      if (batch.length >= BATCH_SIZE) {
        flush()
      }
    }
  }

  flush()
  parentPort?.postMessage({ type: 'done', total } satisfies ScanMessage)
}

scan().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  parentPort?.postMessage({ type: 'error', error: message } satisfies ScanMessage)
})
