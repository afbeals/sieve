import { extname } from 'node:path'

export function getExtension(name: string): string {
  return extname(name).toLowerCase().replace(/^\./, '')
}

// Soft-deleted files live here (see fileOps.ts deletePaths) - excluded from scanning,
// watching, and thumbnailing so trashed items don't clutter the main listing or get indexed
// like ordinary content.
export const TRASH_DIR_NAME = '.dir-explorer-trash'
