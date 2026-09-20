import { describe, expect, it } from 'vitest'
import { getExtension } from '../paths'

describe('getExtension', () => {
  it('strips the leading dot', () => {
    expect(getExtension('photo.png')).toBe('png')
  })

  it('lowercases a mixed-case extension', () => {
    expect(getExtension('IMAGE.PNG')).toBe('png')
  })

  it('returns an empty string for a file with no extension', () => {
    expect(getExtension('README')).toBe('')
  })

  it('uses the last extension for a multi-dot filename', () => {
    expect(getExtension('archive.tar.gz')).toBe('gz')
  })

  it('treats a leading-dot dotfile as having no extension', () => {
    expect(getExtension('.gitignore')).toBe('')
  })
})
