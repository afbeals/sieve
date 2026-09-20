import { describe, expect, it } from 'vitest'
import { getMediaExtensions, getMediaKind } from '../media'

describe('getMediaKind', () => {
  it('classifies a common image extension as image', () => {
    expect(getMediaKind('jpg')).toBe('image')
    expect(getMediaKind('png')).toBe('image')
  })

  it('classifies a common video extension as video', () => {
    expect(getMediaKind('mp4')).toBe('video')
    expect(getMediaKind('mov')).toBe('video')
  })

  it('returns null for a non-media extension', () => {
    expect(getMediaKind('pdf')).toBeNull()
    expect(getMediaKind('')).toBeNull()
  })

  it('is case-sensitive, matching only the lowercase extensions the app stores', () => {
    // ext values are already lowercased by getExtension() before reaching this function -
    // an uppercase input is not expected to match, which this pins down explicitly.
    expect(getMediaKind('JPG')).toBeNull()
  })
})

describe('getMediaExtensions', () => {
  it('includes both image and video extensions with no duplicates', () => {
    const extensions = getMediaExtensions()
    expect(extensions).toContain('jpg')
    expect(extensions).toContain('mp4')
    expect(new Set(extensions).size).toBe(extensions.length)
  })
})
