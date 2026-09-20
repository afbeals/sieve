export function tokenizeFileName(name: string): string[] {
  const withoutExt = name.replace(/\.[^./\\]+$/, '')
  return withoutExt
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter((token) => token.length > 0)
}
