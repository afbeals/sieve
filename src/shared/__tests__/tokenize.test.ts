import { describe, expect, it } from 'vitest'
import { tokenizeFileName } from '../tokenize'

describe('tokenizeFileName', () => {
  it('splits on non-alphanumeric separators and lowercases each token', () => {
    expect(tokenizeFileName('My Photo_2023.jpg')).toEqual(['my', 'photo', '2023'])
  })

  it('strips only the final extension', () => {
    expect(tokenizeFileName('IMG-001.png')).toEqual(['img', '001'])
  })

  it('treats every dot-segment before the last as part of the name', () => {
    expect(tokenizeFileName('archive.tar.gz')).toEqual(['archive', 'tar'])
  })

  it('returns the whole name as one token when there is no extension', () => {
    expect(tokenizeFileName('noextension')).toEqual(['noextension'])
  })

  it('returns no tokens for a dotfile with nothing before the dot', () => {
    // The whole string matches the trailing-extension pattern, so it's stripped entirely.
    expect(tokenizeFileName('.hidden')).toEqual([])
  })

  it('returns an empty array for an empty name', () => {
    expect(tokenizeFileName('')).toEqual([])
  })
})
