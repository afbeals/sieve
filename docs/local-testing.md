# Local Testing Guide

## Prerequisites

- Node **22.22.2** (see [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for why the pin matters and
  what breaks without it)
- Yarn (classic v1)

```bash
nvm use               # or: PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" for one-off commands
yarn install
```

---

## 1. Dev loop

```bash
yarn dev
```

Launches the actual Electron app (not a browser preview) with hot module reload on both the
renderer (Vite HMR) and, less commonly needed, the main process (restart `yarn dev` after
editing anything under `src/main/` — main-process changes aren't hot-reloaded, only the
renderer is).

Point it at any folder via "Choose folder…" in the toolbar. For a throwaway test folder with a
realistic mix of content:

```bash
mkdir -p /tmp/sieve-test/{sub1,sub2}
touch /tmp/sieve-test/{report,IMG_0042,screenshot-2024-01-15,notes}.txt
cp /path/to/some.jpg /tmp/sieve-test/sub1/
cp /path/to/some.mp4 /tmp/sieve-test/sub2/
```

Video/image files are what exercise the thumbnail pipeline — a folder of only `.txt` files will
never touch `thumbnail-worker.ts` at all.

## 2. Exercise every feature by hand

There's no Playwright/E2E suite yet (see [FUTURE_UPDATES.md](FUTURE_UPDATES.md)) — `App.test.tsx`
covers behavioral characterization with a mocked `window.api`, not real filesystem I/O or a real
running Electron window. Before relying on a change, walk through:

- **Scanning**: pick a root, confirm the scan-progress indicator and final count; toggle "Show
  entire subtree" (recursive vs single-folder) and confirm the row count changes accordingly
- **Live watching**: with the app open on a folder, rename/create/delete a file in Finder/Explorer
  *outside* the app and confirm the list updates without a manual Rescan
- **Sorting**: click each column header, confirm ascending → descending toggle and the sort
  indicator (▲/▼)
- **Regex filtering**: add a fuzzy pattern, then a strict regex pattern, combine two rules with
  AND and with OR, try `invert`; confirm the live "N would match" count while typing; check
  "Recent" pattern history after adding a filter
- **Quick filters**: toggle an extension group, a size preset, and a date preset; confirm they
  compose with the regex filter rules (all AND'd together at the query level)
- **Grouping**: click "Analyze words", select a couple of word chips, confirm the list groups
  and the "Jump to" chips scroll to each group; deselect a word and confirm regrouping
- **Views**: switch Table / Grouped / Gallery display modes; in Table, drag a column border to
  resize it and confirm the resize persists across a re-render
- **Selection & preview**: single-select (preview card appears), select exactly 2 (side-by-side
  compare + "Same size"/"Shares word" match hints if applicable), multi-select (aggregate count +
  total size only, no preview)
- **Media preview**: select an image and a video file one at a time; confirm a thumbnail appears
  for both, the video shows a multi-frame carousel with working prev/next, and clicking the image
  opens the full-size lightbox
- **File ops**: rename (double-click or context menu), bulk rename 2+ selected items, new folder,
  cut/copy/paste, drag-and-drop a file onto a folder row, duplicate, delete (confirm it lands in
  a `.dir-explorer-trash` folder inside the scanned root, not the OS trash), empty trash; then
  Undo/Redo each of the above in sequence
- **Pinning**: pin a couple of rows, confirm the pinned popover lists them and "select pinned"
  re-selects them, unpin one, clear all
- **Saved views**: build up a filter/sort/grouping combination, save it as a named view, switch to
  something else, reload the saved view and confirm everything comes back exactly
- **Storage breakdown**: open the storage popover and confirm the per-extension bars match what
  you'd expect for the test folder
- **Settings**: open Settings, change thumbnail resolution/frame count and worker concurrency,
  Save, confirm a **Rescan** picks up the new thumbnail settings for newly (re)generated
  thumbnails only (already-generated thumbnails don't retroactively resize — the cache key isn't
  resolution-aware, see ARCHITECTURE.md); export config to a file, import it back
- **Theme**: toggle light/dark/system and confirm it actually changes the UI, not just the stored
  setting

## 3. Run the automated test suite

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn test        # once
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn test:watch  # watch mode
```

70 tests across 7 files as of this writing:

| File | Environment | Covers |
|---|---|---|
| `src/main/__tests__/db.test.ts` | `node` | Schema, filter/scope SQL generation, regex matching, aggregates |
| `src/main/__tests__/fileOps.test.ts` | `node` | Rename/move/copy/duplicate collision handling, trash lifecycle |
| `src/main/__tests__/paths.test.ts` | `node` | `getExtension()` edge cases |
| `src/main/__tests__/settings.test.ts` | `node` | Load/save merge behavior, export/import round trip |
| `src/shared/__tests__/media.test.ts` | `node` | `getMediaKind()` extension classification |
| `src/shared/__tests__/tokenize.test.ts` | `node` | `tokenizeFileName()` edge cases |
| `src/renderer/src/__tests__/App.test.tsx` | `jsdom` | Full-app characterization — rendered DOM/behavior only |

**Environment is per-file, not filename-driven**: `vitest.config.ts` defaults to `node`; a
renderer test opts into DOM support with a docblock at the very top of the file:

```ts
// @vitest-environment jsdom
```

**`react-virtuoso` is mocked** (`src/renderer/src/test/reactVirtuosoMock.tsx`), not polyfilled —
jsdom does no real layout, and getting real `react-virtuoso` to actually render rows under jsdom
(it measures via `ResizeObserver` + real scroll-container height) turned out more fragile than
it's worth. This only affects renderer tests; main-process tests never import it.

**`window.api` is mocked** (`src/renderer/src/test/mockApi.ts`) rather than hitting real IPC —
it implements the full `Api` type from `preload/index.ts` plus test-only escape hatches (e.g.
`__triggerScanDone()`) that invoke whatever callback a component registered via the real
`on*` subscription methods, so a test can simulate a push event without a real round trip.

`App.test.tsx`'s tests are **characterization tests**: they assert on rendered DOM and user-
visible behavior, not implementation details — which is exactly why the entire [Phase H
decomposition](../CurrentSession/397c5fc6-019b-4d6a-9393-e2adbeeedfbf.md) (splitting `App.tsx`
from 2,947 to 934 lines across 10 hooks and 12 components) needed **zero** test edits despite
touching nearly every line of the file being tested.

## 4. Type checking

```bash
yarn typecheck   # works fine under system Node - no PATH prefix needed
```

Runs `tsc --noEmit` twice: once against `tsconfig.node.json` (main + preload + shared) and once
against `tsconfig.web.json` (renderer). Never run `tsc` directly against a single file — the
path aliases and per-context `lib`/`types` settings only resolve correctly through one of these
two project configs.

## 5. Packaging dry-run

Before actually distributing a build, a quick local sanity check:

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn dist:mac   # on macOS
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" yarn dist:win   # on Windows, see PACKAGING.md
```

See [PACKAGING.md](PACKAGING.md) for what to actually check once it's built (it is *not* enough
that the build command exits 0 — see that doc's ffmpeg-binary caveat before trusting a
cross-platform build).

## Typical iteration loop

```
edit → yarn dev (renderer changes hot-reload; restart for main-process changes)
     → manually exercise the specific feature you touched
     → yarn typecheck
     → yarn test
     → commit
```

Don't run the full manual walkthrough in step 2 after every tiny change — that's for before a
larger change ships or when touching something with a lot of surface area (file ops, the
grouping pipeline). For a small, well-scoped change, `yarn typecheck` + `yarn test` + a targeted
manual check of just the thing you changed is enough.
