import { parentPort, workerData } from 'node:worker_threads'
import { tokenizeFileName } from '../shared/tokenize'
import type { WordFrequencyEntry } from '../shared/types'

const TOP_WORD_LIMIT = 50

const names = workerData.names as string[]
const counts = new Map<string, number>()

for (const name of names) {
  for (const token of tokenizeFileName(name)) {
    counts.set(token, (counts.get(token) ?? 0) + 1)
  }
}

const words: WordFrequencyEntry[] = Array.from(counts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, TOP_WORD_LIMIT)
  .map(([word, count]) => ({ word, count }))

parentPort?.postMessage({ words })
