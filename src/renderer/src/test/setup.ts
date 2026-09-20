import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'

// See reactVirtuosoMock.tsx for why: jsdom doesn't do real layout, and polyfilling
// react-virtuoso's ResizeObserver-based measurement protocol well enough to get it to actually
// render rows is more fragile than it's worth. This only affects renderer tests - main-process
// tests never import react-virtuoso, so the mock is simply unused there.
vi.mock('react-virtuoso', () => import('./reactVirtuosoMock'))

// This setup file runs for every test file regardless of environment (main-process tests use
// plain `node`, with no `window` at all) - guard the DOM-only polyfills below so they're a
// no-op there instead of throwing on `window`.
if (typeof window !== 'undefined') {
  // Without `test.globals: true`, React Testing Library's automatic per-test unmount never
  // registers - every render() in a file would otherwise pile up in the same document instead
  // of being torn down between tests.
  afterEach(() => {
    cleanup()
  })

  // jsdom implements neither of these. Mantine's color-scheme detection ('auto' mode) reads
  // matchMedia, and react-virtuoso's virtualization measures element size via ResizeObserver -
  // both are unconditionally called on mount, so without a stub every render throws immediately.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false
      }) as MediaQueryList
  }

  // jsdom has no ResizeObserver at all - Mantine components that track their own size (e.g.
  // SegmentedControl's FloatingIndicator) call it unconditionally on mount, so without a stub
  // every render throws immediately. (react-virtuoso is mocked instead of relying on this - see
  // reactVirtuosoMock.tsx - since a fixed fake size wasn't enough to make it actually render
  // rows under jsdom.)
  class ResizeObserverStub {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element): void {
      const rect = { width: 800, height: 600, top: 0, left: 0, bottom: 600, right: 800, x: 0, y: 0 }
      this.callback(
        [{ target, contentRect: rect, borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: [] } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver
      )
    }
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

  // jsdom lays out nothing, so every element's rect is all-zero by default - react-virtuoso
  // reads its scroll container's height to decide how many rows fit, and with a 0px viewport
  // it renders zero rows. A fixed nonzero size lets it virtualize a real, assertable window.
  Element.prototype.getBoundingClientRect = () =>
    ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      x: 0,
      y: 0,
      toJSON: () => {}
    }) as DOMRect
}
